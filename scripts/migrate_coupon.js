/**
 * v1.7.3 优惠券功能初始化迁移
 *
 * 三件事（全部幂等，可重复执行）：
 *   1. 建券批次表 pp_coupon、用户券表 pp_user_coupon
 *   2. pp_order 新增 4 个优惠券相关列：coupon_id / coupon_sn / discount_price / pay_amount
 *   3. 回填历史订单：discount_price=0、pay_amount=total_price（保证资金链路无需判空）
 *
 * 金额口径（本次确立）：
 *   total_price    = 原价（各项费用之和），**保持不变**，GMV/报表口径不受影响
 *   discount_price = 优惠券抵扣金额
 *   pay_amount     = total_price - discount_price，实际支付/退款金额
 * 因此支付回调核验与微信退款的 total_fee 都必须改用 pay_amount（代码同步调整）。
 *
 * 用法：node scripts/migrate_coupon.js
 * 回滚：DROP TABLE pp_user_coupon; DROP TABLE pp_coupon; ALTER TABLE pp_order DROP COLUMN ...
 */
const MySQL = require('../src/utils/mysql');

async function hasTable(db, table) {
  const [row] = await db.query(
    `SELECT COUNT(*) n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return row.n > 0;
}

async function hasColumn(db, table, column) {
  const [row] = await db.query(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row.n > 0;
}

async function main() {
  const db = new MySQL();
  const log = (...a) => console.log(...a);

  try {
    // 中文注释安全：显式指定连接字符集（v1.6.6 曾因字符集不对导致注释乱码）
    await db.query('SET NAMES utf8mb4');

    /* ---------- 1. 券批次表 ---------- */
    log('== 1. pp_coupon 券批次表 ==');
    if (await hasTable(db, 'pp_coupon')) {
      log('  已存在，跳过');
    } else {
      await db.query(`
        CREATE TABLE pp_coupon (
          id                 INT AUTO_INCREMENT PRIMARY KEY,
          coupon_id          VARCHAR(32) NOT NULL COMMENT '券批次号（业务唯一）',
          name               VARCHAR(50) NOT NULL COMMENT '券名称',
          amount             DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '面额（元）',
          threshold          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '使用门槛（元），本期不校验，预留',
          total_stock        INT NOT NULL DEFAULT 0 COMMENT '总库存',
          remain_stock       INT NOT NULL DEFAULT 0 COMMENT '剩余库存',
          per_limit          INT NOT NULL DEFAULT 1 COMMENT '每人限领张数',
          use_per_limit      INT NOT NULL DEFAULT 1 COMMENT '每人可用张数',
          receive_start_time DATETIME NOT NULL COMMENT '可领取开始时间',
          receive_end_time   DATETIME NOT NULL COMMENT '可领取结束时间',
          use_start_time     DATETIME NOT NULL COMMENT '可使用开始时间',
          use_end_time       DATETIME NOT NULL COMMENT '可使用结束时间',
          scope_type         TINYINT NOT NULL DEFAULT 1 COMMENT '使用范围：1全场 2指定车辆',
          scope_car_ids      VARCHAR(200) DEFAULT NULL COMMENT '适用车辆ID（逗号分隔，scope_type=2 时有效）',
          user_scope         TINYINT NOT NULL DEFAULT 0 COMMENT '适用人群：0全部 1新用户 2老用户（预留）',
          bear_type          VARCHAR(20) NOT NULL DEFAULT 'platform' COMMENT '成本承担方：platform=平台承担（预留扩展）',
          status             TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0未开始 1活动中 2已废弃',
          create_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          update_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_coupon_id (coupon_id),
          KEY idx_status_time (status, receive_end_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='优惠券批次表'
      `);
      log('  已创建');
    }

    /* ---------- 2. 用户券表 ---------- */
    log('\n== 2. pp_user_coupon 用户券表 ==');
    if (await hasTable(db, 'pp_user_coupon')) {
      log('  已存在，跳过');
    } else {
      await db.query(`
        CREATE TABLE pp_user_coupon (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          coupon_sn       VARCHAR(32) NOT NULL COMMENT '券码（全局唯一）',
          coupon_id       VARCHAR(32) NOT NULL COMMENT '券批次号',
          uid             INT NOT NULL COMMENT '领取用户ID',
          name            VARCHAR(50) NOT NULL COMMENT '券名称快照',
          amount          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '面额快照',
          scope_type      TINYINT NOT NULL DEFAULT 1 COMMENT '使用范围快照：1全场 2指定车辆',
          scope_car_ids   VARCHAR(200) DEFAULT NULL COMMENT '适用车辆ID快照（逗号分隔）',
          use_start_time  DATETIME NOT NULL COMMENT '可使用开始时间快照',
          use_end_time    DATETIME NOT NULL COMMENT '可使用结束时间快照',
          status          TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0未使用 1已使用 2已作废',
          receive_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '领取时间',
          use_time        DATETIME DEFAULT NULL COMMENT '使用时间',
          order_sn        VARCHAR(50) DEFAULT NULL COMMENT '使用订单号',
          receive_seq     INT NOT NULL DEFAULT 1 COMMENT '同一用户领取该批次的第几张（配合 uk_coupon_uid_seq 硬防超领）',
          create_time     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          update_time     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_coupon_sn (coupon_sn),
          UNIQUE KEY uk_coupon_uid_seq (coupon_id, uid, receive_seq),
          KEY idx_uid_status (uid, status),
          KEY idx_coupon_id (coupon_id),
          KEY idx_order_sn (order_sn)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户优惠券表'
      `);
      log('  已创建');
    }

    /* ---------- 3. pp_order 新增优惠券列 ---------- */
    log('\n== 3. pp_order 新增优惠券列 ==');
    const columns = [
      {
        name: 'coupon_id',
        ddl: "ALTER TABLE pp_order ADD COLUMN coupon_id VARCHAR(32) DEFAULT NULL COMMENT '优惠券批次号（v1.7.3）'",
      },
      {
        name: 'coupon_sn',
        ddl: "ALTER TABLE pp_order ADD COLUMN coupon_sn VARCHAR(32) DEFAULT NULL COMMENT '优惠券码（v1.7.3）'",
      },
      {
        name: 'discount_price',
        ddl: "ALTER TABLE pp_order ADD COLUMN discount_price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '优惠券抵扣金额（v1.7.3）'",
      },
      {
        name: 'pay_amount',
        ddl: "ALTER TABLE pp_order ADD COLUMN pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '实付金额=total_price-discount_price（v1.7.3，支付与退款以此为准）'",
      },
    ];
    for (const c of columns) {
      if (await hasColumn(db, 'pp_order', c.name)) {
        log(`  ${c.name} 已存在，跳过`);
      } else {
        await db.query(c.ddl);
        log(`  ${c.name} 已添加`);
      }
    }

    // pay_amount 放在 total_price 之后，阅读时更顺（ coupons 金额三兄弟挨在一起 ）
    const [maxIdRow] = await db.query(`
      SELECT COLUMN_NAME cn FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pp_order' ORDER BY ORDINAL_POSITION DESC LIMIT 1
    `);
    if (maxIdRow && maxIdRow.cn !== 'pay_amount') {
      const [def] = await db.query(
        `SELECT COLUMN_TYPE ct, IS_NULLABLE nl, COLUMN_DEFAULT df, COLUMN_COMMENT cm
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pp_order' AND COLUMN_NAME = 'pay_amount'`
      );
      const nullable = def.nl === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultValue = def.df === null ? '' : ` DEFAULT ${def.df}`;
      await db.query(
        `ALTER TABLE pp_order MODIFY COLUMN pay_amount ${def.ct} ${nullable}${defaultValue} COMMENT '${def.cm}' AFTER discount_price`
      );
      log('  pay_amount 已调整至 discount_price 之后');
    }

    /* ---------- 4. 回填历史订单 ---------- */
    log('\n== 4. 回填历史订单 ==');
    const res = await db.query('UPDATE pp_order SET pay_amount = total_price WHERE pay_amount = 0');
    log(`  pay_amount 回填 ${res.affectedRows} 行（历史订单实付=原价）`);

    /* ---------- 5. 校验 ---------- */
    log('\n== 5. 校验 ==');
    const [order] = await db.query('SHOW CREATE TABLE pp_order');
    log(order['Create Table'].split('\n').filter((l) => l.includes('coupon') || l.includes('discount_price') || l.includes('pay_amount')).join('\n'));
    const [stat] = await db.query('SELECT COUNT(*) n, IFNULL(SUM(pay_amount),0) s FROM pp_order');
    log(`\n  pp_order：${stat.n} 行，实付合计 ￥${stat.s}`);
    log('\n迁移完成。');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
