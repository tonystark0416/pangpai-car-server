/**
 * v1.7.12 优惠券支持「领取后 N 小时可用」（相对有效期）
 *
 * pp_coupon 加两列（幂等，可重复执行）：
 *   valid_type  TINYINT NOT NULL DEFAULT 1  —— 1=固定时间段（现状），2=领取后 N 小时可用
 *   valid_hours INT NULL                    —— 类型 2 时必填：领取后多少小时内可用
 *
 * 口径（v1.7.12 定）：
 *   - 用户券可用期以领券时刻快照为准（use_start_time=领券时刻，use_end_time=领券时刻+N 小时），
 *     下游派生状态/筛选/核验全部只认用户券快照，无需改动；
 *   - 批次维度 valid_type=2 时「批次状态」只看领取窗口（领取截止 = 批次结束），
 *     批次上的 use_start_time/use_end_time 仅作兜底展示值（= 领取窗口），不参与过期判断。
 *
 * 用法：node scripts/migrate_coupon_validtype.js
 */
const MySQL = require('../src/utils/mysql');

async function columnExists(db, table, column) {
  const rows = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return Number(rows[0].n) > 0;
}

async function main() {
  const db = new MySQL();
  try {
    if (await columnExists(db, 'pp_coupon', 'valid_type')) {
      console.log('· pp_coupon.valid_type 已存在，跳过');
    } else {
      await db.query(
        "ALTER TABLE pp_coupon ADD COLUMN valid_type TINYINT NOT NULL DEFAULT 1 COMMENT '有效期类型：1=固定时间段 2=领取后N小时可用' AFTER use_end_time"
      );
      console.log('✔ 已加列 pp_coupon.valid_type（默认 1 = 固定时间段，存量批次行为不变）');
    }

    if (await columnExists(db, 'pp_coupon', 'valid_hours')) {
      console.log('· pp_coupon.valid_hours 已存在，跳过');
    } else {
      await db.query(
        "ALTER TABLE pp_coupon ADD COLUMN valid_hours INT NULL COMMENT '领取后N小时内可用（valid_type=2 时必填，1~8760）' AFTER valid_type"
      );
      console.log('✔ 已加列 pp_coupon.valid_hours');
    }

    // 校验存量数据一致性（都应为 valid_type=1，无需回填）
    const rows = await db.query('SELECT COUNT(*) AS n FROM pp_coupon WHERE valid_type IS NULL OR valid_type NOT IN (1,2)');
    if (Number(rows[0].n) > 0) {
      await db.query('UPDATE pp_coupon SET valid_type = 1 WHERE valid_type IS NULL OR valid_type NOT IN (1,2)');
      console.log('✔ 修正 ' + rows[0].n + ' 个批次 valid_type → 1');
    }
    console.log('\n✔ 迁移完成');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败：', e.message);
  process.exit(1);
});
