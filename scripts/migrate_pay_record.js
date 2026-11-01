/**
 * v1.7.9 支付流水表迁移脚本
 *
 * 背景：后台要看「任意一条支付/退款流水」，但现状是——
 *   - 支付只记了 `pp_order.transaction_id` + `pay_time`，没有付款银行、微信侧状态等明细；
 *   - **退款完全没有流水**：`markOrderRefunded` 只把状态改成「已退款」，
 *     退款金额、退款单号、微信 refund_id、到账状态全都不落库，只能登微信后台看。
 *
 * 新建 `pp_pay_record`：**支付与退款共用一张表**，用 `record_type` 区分，
 * 差异字段存进 `raw`(JSON) —— 微信原始返回，将来要扩字段不必改表。
 *
 * 安全设计：① 加表幂等（已存在则跳过）；② 只新增，不改动任何既有表；
 *          ③ 回填：把已存在的支付/退款记录补进流水表（依赖微信查单/退款查询，可选执行）
 * 用法：
 *   node scripts/migrate_pay_record.js            # 建表（幂等）
 *   node scripts/migrate_pay_record.js --backfill # 建表 + 回填历史流水（会调用微信接口）
 */
const MySQL = require('../src/utils/mysql');
const payModel = require('../src/models/pay.model');
const WechatPayV2 = require('../src/services/wechat/pay');
const config = require('../src/config');

const wechatPay = new WechatPayV2(config.wxPay);
const TABLE = 'pp_pay_record';

/**
 * 回填历史流水
 *
 * 新表建好后是空的，页面一开始没东西可看。这里把**已支付/已退款**的历史订单
 * 用微信查单（/pay/orderquery）与退款查询（/pay/refundquery）补回来。
 * 只补这两种状态：未支付的订单微信侧没有交易，查了也是 NOTPAY，没有流水价值。
 */
async function backfillHistory(db) {
  const orders = await db.query(
    `SELECT order_sn, uid, pay_status, pay_amount, total_price, transaction_id
     FROM pp_order WHERE pay_status IN (1, 2) ORDER BY create_time ASC`
  );
  console.log(`\n== 3. 回填历史流水（${orders.length} 笔已支付/已退款订单）==`);

  let payOk = 0;
  let refundOk = 0;
  let skipped = 0;

  for (const order of orders) {
    // 1) 支付流水
    try {
      const wx = await wechatPay.orderQuery({ outTradeNo: order.order_sn });
      if (wx.result_code === 'SUCCESS') {
        const r = await payModel.savePayRecord(payModel.buildPayRecordFromPay(order, wx, 'backfill'));
        if (r > 0) payOk += 1;
        else skipped += 1;
        console.log(`   支付 ${order.order_sn} → ${wx.trade_state}（${payModel.PAY_STATUS_TEXT[wx.trade_state] || wx.trade_state}）`);
      } else {
        skipped += 1;
        console.log(`   支付 ${order.order_sn} 查单未成功：${wx.err_code} ${wx.err_code_des || ''}`);
      }
    } catch (e) {
      skipped += 1;
      console.log(`   支付 ${order.order_sn} 异常：${e.message}`);
    }

    // 2) 退款流水
    //    **对所有已支付订单都查**，不只 pay_status=2 的。原因：本脚本第一次上线时就靠这一步
    //    发现了订单 PP20261011204940——库里 pay_status=1（已支付），微信侧却早已退款成功。
    //    这笔是在**微信商户平台手工退的**，没走我们的接口，所以本地既无流水、订单状态也没变；
    //    而它的商户退款单号是微信自动生成的一串数字，用我们自己的 R+订单号 规则去查只会
    //    返回 REFUNDNOTEXIST。**只传 out_trade_no 才能查到**，故这里不传 out_refund_no。
    try {
      const wx = await wechatPay.refundQuery({ outTradeNo: order.order_sn });
      if (wx.result_code === 'SUCCESS') {
        const r = await payModel.savePayRecord(
          payModel.buildPayRecordFromRefund(order, wx, { source: 'backfill' })
        );
        if (r > 0) refundOk += 1;
        const st = payModel.pickRefund(wx, 'refund_status');
        console.log(`   退款 ${order.order_sn} → ${st}（${payModel.REFUND_STATUS_TEXT[st] || st}）`);

        // 对账告警：微信侧确实退了，但库里没标记已退款 → 只告警，**不自动改库**
        if (Number(order.pay_status) !== 2) {
          console.log(
            `   ⚠️  不一致：微信侧已退款，但订单库 pay_status=${order.pay_status}（未标记已退款）。` +
              `请人工核对后执行 UPDATE pp_order SET pay_status=2, order_status=4 WHERE order_sn='${order.order_sn}'`
          );
        }
      } else if (wx.err_code === 'REFUNDNOTEXIST') {
        // 没退过款，正常，不计数
      } else {
        console.log(`   退款 ${order.order_sn} 查询未成功：${wx.err_code} ${wx.err_code_des || ''}`);
      }
    } catch (e) {
      console.log(`   退款 ${order.order_sn} 异常：${e.message}`);
    }
  }

  console.log(`\n回填完成：支付 ${payOk} 条，退款 ${refundOk} 条，跳过/失败 ${skipped} 条`);
  console.log('提示：出现「⚠️ 不一致」的订单需人工核对后再改订单状态，本脚本不会自动修改');
}

async function tableExists(db) {
  const [row] = await db.query(
    `SELECT COUNT(*) n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLE]
  );
  return row.n > 0;
}

async function main() {
  const db = new MySQL();
  const log = (...a) => console.log(...a);
  const backfill = process.argv.includes('--backfill');

  try {
    // 中文注释必须显式声明连接字符集，否则注释可能以错误编码写入（v1.6.6 踩过）
    await db.query('SET NAMES utf8mb4');

    /* ---------- 1. 建表（幂等） ---------- */
    log(`== 1. 建表 ${TABLE} ==`);
    if (await tableExists(db)) {
      log('   已存在，跳过');
    } else {
      await db.query(`
        CREATE TABLE ${TABLE} (
          id int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT '流水ID',
          record_type tinyint(4) NOT NULL DEFAULT 1 COMMENT '类型：1支付 2退款',
          order_sn varchar(50) NOT NULL COMMENT '关联订单号（pp_order.order_sn）',
          uid int(10) DEFAULT NULL COMMENT '下单用户 ID',
          out_trade_no varchar(50) DEFAULT NULL COMMENT '商户订单号',
          out_refund_no varchar(64) DEFAULT NULL COMMENT '商户退款单号（退款时）',
          transaction_id varchar(32) DEFAULT NULL COMMENT '微信支付单号',
          refund_id varchar(32) DEFAULT NULL COMMENT '微信退款单号（退款时）',
          amount decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT '本笔金额（元）：支付=实付，退款=退款额',
          status varchar(20) DEFAULT NULL COMMENT '微信状态原值，如 SUCCESS / PROCESSING / CHANGE',
          status_text varchar(30) DEFAULT NULL COMMENT '状态中文，如 支付成功 / 退款处理中',
          bank_type varchar(20) DEFAULT NULL COMMENT '付款银行，如 CFT / ICBC_DEBIT',
          fund_change varchar(4) DEFAULT NULL COMMENT '退款是否即时到账：Y 即时 / N 非即时（银行卡异步）',
          trade_time datetime DEFAULT NULL COMMENT '微信侧时间（支付完成时间 / 退款成功时间）',
          source varchar(20) DEFAULT NULL COMMENT '来源：callback 回调 / check 查单兜底 / manual 后台同步 / refund 退款',
          raw json DEFAULT NULL COMMENT '微信原始返回（审计用）',
          create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          PRIMARY KEY (id),
          -- 幂等键：同一笔支付/退款只记一条（MySQL 唯一索引允许多个 NULL，退款单号可为空）
          UNIQUE KEY uk_pay (record_type, out_trade_no),
          UNIQUE KEY uk_refund_no (out_refund_no),
          KEY idx_order_sn (order_sn),
          KEY idx_transaction_id (transaction_id),
          KEY idx_uid (uid),
          KEY idx_trade_time (trade_time),
          KEY idx_create_time (create_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水表（v1.7.9，支付与退款共用）'
      `);
      log('   ✔ 已创建');
    }

    /* ---------- 2. 显示表结构 ---------- */
    const cols = await db.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [TABLE]
    );
    log(`\n== 2. ${TABLE} 结构 ==`);
    cols.forEach((c) => log(`   ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | ${c.COLUMN_COMMENT || ''}`));

    const [cnt] = await db.query(`SELECT COUNT(*) n FROM ${TABLE}`);
    log(`\n当前流水条数：${cnt.n}`);

    if (backfill) {
      await backfillHistory(db);
      const [cnt2] = await db.query(`SELECT COUNT(*) n FROM ${TABLE}`);
      log(`\n回填后流水条数：${cnt2.n}`);
    } else {
      log('\n提示：要回填历史流水请加 --backfill（会调用微信查单/退款查询接口）');
    }
    log('\n✔ 迁移完成');
  } catch (e) {
    console.error('迁移失败:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
