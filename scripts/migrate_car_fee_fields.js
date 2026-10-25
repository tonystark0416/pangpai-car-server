/**
 * v1.6.18 车辆费用字段迁移脚本
 *
 * 背景：此前「整备费」是写死的 1 元、「保险」是全局三档（0/1/120），无法按车型差异化定价。
 * 现在改为**每辆车单独配置**：
 *   - pp_car.clean_price          整备费（按订单一次性收取，不乘天数）
 *   - pp_car.insurance_price_l1   低档保险日单价（必买，默认低档）
 *   - pp_car.insurance_price_l2   高档保险日单价
 * 同时给 pp_order 增加 clean_price **快照列**（此前整备费从未落库，只算进总价）。
 *
 * 计价公式：总费用 = 车辆日租金 × 天数 + 保险日单价 × 天数 + 司机日单价 × 天数 + 整备费
 *
 * 安全设计：① 先建备份表；② ALTER/UPDATE 全部幂等（存在则跳过）；③ 不改任何已有业务数据金额
 * 用法：node scripts/migrate_car_fee_fields.js
 */
const MySQL = require('../src/utils/mysql');

const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

/** 判断表中是否已有某列 */
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
    /* ---------- 1. 备份（库内备份表） ---------- */
    log('== 1. 备份 ==');
    for (const t of ['pp_car', 'pp_order']) {
      const bak = `${t}_bak_${STAMP}`;
      const [exists] = await db.query(
        `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
        [bak]
      );
      if (exists.n === 0) {
        await db.query(`CREATE TABLE ${bak} AS SELECT * FROM ${t}`);
        const [{ n }] = await db.query(`SELECT COUNT(*) n FROM ${bak}`);
        log(`  已建备份表 ${bak}（${n} 行）`);
      } else {
        log(`  备份表已存在，跳过：${bak}`);
      }
    }

    /* ---------- 2. pp_car 新增费用配置列 ---------- */
    log('== 2. pp_car 新增费用列 ==');
    const carCols = [
      { name: 'clean_price', ddl: 'DECIMAL(10,2) NOT NULL DEFAULT 50', comment: '整备费（按订单一次性收取，不乘天数）' },
      { name: 'insurance_price_l1', ddl: 'DECIMAL(10,2) NOT NULL DEFAULT 100', comment: '低档保险日单价（× 天数）' },
      { name: 'insurance_price_l2', ddl: 'DECIMAL(10,2) NOT NULL DEFAULT 200', comment: '高档保险日单价（× 天数）' },
    ];
    for (const c of carCols) {
      if (await hasColumn(db, 'pp_car', c.name)) {
        log(`  已存在，跳过：pp_car.${c.name}`);
        continue;
      }
      await db.query(`ALTER TABLE pp_car ADD COLUMN ${c.name} ${c.ddl} COMMENT '${c.comment}'`);
      log(`  已新增 pp_car.${c.name}（默认 ${c.ddl.match(/DEFAULT (\d+)/)[1]}）`);
    }

    /* ---------- 3. pp_order 新增整备费快照列 ---------- */
    log('== 3. pp_order 新增整备费快照列 ==');
    if (await hasColumn(db, 'pp_order', 'clean_price')) {
      log('  已存在，跳过：pp_order.clean_price');
    } else {
      await db.query(
        "ALTER TABLE pp_order ADD COLUMN clean_price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '整备费快照（下单时按车辆配置写入）'"
      );
      // 历史订单：v1.6.18 之前整备费固定 1 元，回填保证金额明细可对账
      const res = await db.query('UPDATE pp_order SET clean_price = 1 WHERE clean_price = 0');
      log(`  已新增 pp_order.clean_price，并回填历史订单 ${res.affectedRows} 行为 1 元（原固定值）`);
    }

    /* ---------- 4. 校验 ---------- */
    log('== 4. 校验 ==');
    const cars = await db.query(
      'SELECT id, car_name, day_price, clean_price, insurance_price_l1, insurance_price_l2 FROM pp_car ORDER BY id'
    );
    log(`  车辆 ${cars.length} 辆，费用配置（前 5 辆）：`);
    cars.slice(0, 5).forEach((c) =>
      log(
        `    #${c.id} ${c.car_name}：日租金 ${c.day_price} / 整备费 ${c.clean_price} / 保险 低${c.insurance_price_l1}·高${c.insurance_price_l2}`
      )
    );
    const [{ same }] = await db.query(
      'SELECT COUNT(*) same FROM pp_car WHERE clean_price = 50 AND insurance_price_l1 = 100 AND insurance_price_l2 = 200'
    );
    log(`  使用默认费用配置的车辆数：${same}/${cars.length}`);
    const [{ clean0 }] = await db.query('SELECT COUNT(*) clean0 FROM pp_order WHERE clean_price = 0');
    log(`  整备费仍未回填的订单数：${clean0}（应为 0）`);

    log('\n迁移完成。');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
