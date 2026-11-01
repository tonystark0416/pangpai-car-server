/**
 * 定时查单兜底（v1.7.8）
 *
 * 【为什么需要它】
 * 订单支付状态的唯一真源是微信回调 `/wxPayCallback`。但回调依赖微信能访问到我们的公网地址：
 * 网络抖动、部署重启、微信侧重推失败等情况下，用户**钱付了、回调没到**，订单会永远卡在
 * 「待支付」——用户看到未支付、运营看到没入账，是真实的资金与客诉风险。
 * 微信支付官方要求「回调 + 查单」双保险，本任务就是那第二道保险。
 *
 * 【做什么】
 * 定期扫描「未支付且未取消」的订单 → 调微信 `/pay/orderquery` → 若微信侧已是 SUCCESS，
 * 则**复用与回调完全相同的落库路径**（`orderModel.markOrderPaid`）补写订单状态，并补发企微通知。
 *
 * 【安全边界】
 *   - 只读 + 幂等：落库只认 `pay_status = 0`，重复执行不会产生副作用；
 *   - 金额核验与回调一致（以 `pay_amount ?? total_price` 为准），对不上**绝不落库**，只记日志；
 *   - 单条订单失败不影响整轮，异常吞掉继续跑；
 *   - 只扫 24 小时内、`order_status=0` 的订单，不碰已取消/已退款的废单。
 *
 * 【启动】
 *   node src/tasks/checkPendingPayments.js          # 常驻，每 2 分钟一轮（PM2 托管）
 *   node src/tasks/checkPendingPayments.js --once   # 只跑一轮就退出（联调用）
 *   node src/tasks/checkPendingPayments.js --dry-run # 只打印不落库（安全演练）
 */
const schedule = require('node-schedule');
const config = require('../config');
const WechatPayV2 = require('../services/wechat/pay');
const work = require('../services/wechat/work');
const orderModel = require('../models/order.model');
const payModel = require('../models/pay.model');

const wechatPay = new WechatPayV2(config.wxPay);

/** 扫描参数（可用环境变量覆盖，单位：分钟） */
const MIN_AGE = Number(process.env.PAY_CHECK_MIN_AGE || 3); // 太新的订单不查（用户可能在支付中）
const MAX_AGE = Number(process.env.PAY_CHECK_MAX_AGE || 1440); // 超过 24 小时的微信侧早已关单
const LIMIT = Number(process.env.PAY_CHECK_LIMIT || 50); // 每轮最多处理条数
/** 每轮之间的最小间隔（毫秒），串行查单避免打爆微信接口 */
const STEP_DELAY = Number(process.env.PAY_CHECK_STEP_DELAY || 200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 用微信查单结果补写订单状态
 * @param {object} order {order_sn, pay_amount, total_price}
 * @param {object} wx 微信 orderquery 返回
 * @param {boolean} dryRun true 时只打印不落库
 * @returns {Promise<'paid'|'skipped'|'amount_mismatch'|'error'>}
 */
async function reconcileOne(order, wx, dryRun) {
  // 只认「微信侧确实支付成功」
  if (wx.return_code !== 'SUCCESS') {
    console.warn(`[pay-check] ${order.order_sn} 通信失败，跳过：${wx.return_msg}`);
    return 'skipped';
  }
  if (wx.result_code !== 'SUCCESS') {
    // ORDERNOTEXIST：该单号在微信侧不存在（未真正下单或已关闭），属正常
    console.warn(`[pay-check] ${order.order_sn} 查单未成功：${wx.err_code} ${wx.err_code_des || ''}`);
    return 'skipped';
  }
  if (wx.trade_state !== 'SUCCESS') {
    // NOTPAY / CLOSED / REFUND 等：保持原状，不动库
    return 'skipped';
  }

  // 金额核验（与回调同一口径：有券时以实付 pay_amount 为准）
  const expectFee = Math.round(Number(order.pay_amount ?? order.total_price) * 100);
  if (Number(wx.total_fee) !== expectFee) {
    console.error(
      `[pay-check] ${order.order_sn} 金额不一致，拒绝落库：期望 ${expectFee} 分，微信实收 ${wx.total_fee} 分`
    );
    return 'amount_mismatch';
  }

  if (dryRun) {
    console.log(`[pay-check] [dry-run] ${order.order_sn} 应补写为已支付（微信单号 ${wx.transaction_id}）`);
    return 'paid';
  }

  const affected = await orderModel.markOrderPaid(order.order_sn, wx.transaction_id, wx.time_end);
  if (affected === -1) {
    console.error(`[pay-check] ${order.order_sn} 落库异常，下一轮重试`);
    return 'error';
  }
  if (affected === 0) {
    // 期间被回调先落库了，说明回调只是慢了——正常，不报错
    console.log(`[pay-check] ${order.order_sn} 已支付（回调已先落库），幂等跳过`);
  } else {
    console.log(`[pay-check] ✔ 补单成功：${order.order_sn}（微信单号 ${wx.transaction_id}，${wx.time_end}）`);
  }

  // v1.7.9：补单成功也写支付流水（source=check，后台能看出这笔是兜底补回来的）
  try {
    await payModel.savePayRecord(payModel.buildPayRecordFromPay(order, wx, 'check'));
  } catch (e) {
    console.error(`[pay-check] 支付流水写入失败: ${order.order_sn}`, e.message);
  }

  // 回调丢了意味着企微也没收到新订单通知，这里补发一条，标明是补单
  try {
    await work.workSendMsgMiniProgram(
      config.workWx.notifyUserid,
      config.wx.appid,
      config.workWx.miniprogramPage,
      '订单通知',
      '有一笔新订单（支付回调补单）',
      [
        { key: '订单号', value: order.order_sn },
        { key: '支付时间', value: wx.time_end || '-' },
      ]
    );
  } catch (e) {
    console.error('[pay-check] 企微通知失败:', e.message);
  }
  return 'paid';
}

/**
 * 跑一轮查单
 * @param {boolean} [dryRun]
 * @returns {Promise<{scanned:number, paid:number, skipped:number, mismatch:number, error:number}>}
 */
async function runOnce(dryRun = false) {
  const stat = { scanned: 0, paid: 0, skipped: 0, mismatch: 0, error: 0 };
  const orders = await orderModel.listUnpaidOrders({ minMinutes: MIN_AGE, maxMinutes: MAX_AGE, limit: LIMIT });
  if (!orders.length) return stat;

  console.log(`[pay-check] 本轮待查订单 ${orders.length} 条（账龄 ${MIN_AGE}~${MAX_AGE} 分钟）`);
  for (const order of orders) {
    stat.scanned += 1;
    try {
      const wx = await wechatPay.orderQuery({ outTradeNo: order.order_sn });
      const r = await reconcileOne(order, wx, dryRun);
      if (r === 'paid') stat.paid += 1;
      else if (r === 'amount_mismatch') stat.mismatch += 1;
      else if (r === 'error') stat.error += 1;
      else stat.skipped += 1;
    } catch (e) {
      stat.error += 1;
      console.error(`[pay-check] ${order.order_sn} 查单异常:`, e.message);
    }
    if (STEP_DELAY) await sleep(STEP_DELAY);
  }
  console.log(
    `[pay-check] 本轮结束：扫描 ${stat.scanned}，补单 ${stat.paid}，无需处理 ${stat.skipped}，` +
      `金额异常 ${stat.mismatch}，失败 ${stat.error}`
  );
  return stat;
}

// 只允许被直接执行时启动（被 require 时不跑，便于单测与复用）
if (require.main === module) {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const dryRun = args.includes('--dry-run');

  console.log(
    `[pay-check] 启动：${once ? '单轮模式' : '常驻模式（每 2 分钟一轮）'}${dryRun ? '，dry-run 不落库' : ''}` +
      `｜账龄 ${MIN_AGE}~${MAX_AGE} 分钟，每轮上限 ${LIMIT} 条`
  );

  // 启动先跑一轮：进程重启期间漏掉的订单能立刻补上
  runOnce(dryRun).catch((e) => console.error('[pay-check] 首轮异常:', e.message));

  if (!once) {
    // 每 2 分钟的第 0 秒
    schedule.scheduleJob('0 */2 * * * *', () => {
      runOnce(dryRun).catch((e) => console.error('[pay-check] 本轮异常:', e.message));
    });
  }
}

module.exports = { runOnce, reconcileOne };
