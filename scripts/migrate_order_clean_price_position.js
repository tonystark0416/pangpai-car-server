/**
 * v1.6.19 调整 pp_order.clean_price 的物理列位置
 *
 * 背景：v1.6.18 用 ADD COLUMN 新增整备费快照列，落到了表最后一列（return_time 之后），
 * 人工看表 / DB 工具里费用字段被拆散。现调整到语义正确的位置：
 *   ... driver_total_price → clean_price → total_price ...
 * 即「租金 → 保险 → 司机 → 整备费 → 总价」，与计价公式顺序一致。
 *
 * 安全设计：① 先建库内备份表；② 幂等（位置已正确则跳过）；③ MODIFY 时原样带回
 *   类型 / NOT NULL / DEFAULT / 中文注释（注释从 information_schema 读出，避免硬编码
 *   导致乱码或丢失 —— v1.6.6 曾因 ALTER 连接字符集问题造成注释乱码）；④ 前后校验行数
 *   与金额合计，确保数据未变。
 *
 * 用法：node scripts/migrate_order_clean_price_position.js
 */
const MySQL = require('../src/utils/mysql');

const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const TABLE = 'pp_order';
const COLUMN = 'clean_price';
const AFTER = 'driver_total_price';

/** 读取某列的元数据（类型、非空、默认值、注释） */
async function getColumnMeta(db, table, column) {
  const [row] = await db.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return row;
}

/** 读取全表列顺序 */
async function getColumns(db, table) {
  return db.query(
    `SELECT COLUMN_NAME, ORDINAL_POSITION
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
}

async function main() {
  const db = new MySQL();
  const log = (...a) => console.log(...a);

  try {
    /* ---------- 1. 备份 ---------- */
    log('== 1. 备份 ==');
    const bak = `${TABLE}_bak_${STAMP}`;
    const [exists] = await db.query(
      `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
      [bak]
    );
    if (exists.n === 0) {
      await db.query(`CREATE TABLE ${bak} AS SELECT * FROM ${TABLE}`);
      const [{ n }] = await db.query(`SELECT COUNT(*) n FROM ${bak}`);
      log(`  已建备份表 ${bak}（${n} 行）`);
    } else {
      const [{ n }] = await db.query(`SELECT COUNT(*) n FROM ${bak}`);
      log(`  备份表已存在，跳过：${bak}（${n} 行）`);
    }

    /* ---------- 2. 记录迁移前状态 ---------- */
    const before = await getColumns(db, TABLE);
    const posCol = before.find((c) => c.COLUMN_NAME === COLUMN).ORDINAL_POSITION;
    const posAfter = before.find((c) => c.COLUMN_NAME === AFTER).ORDINAL_POSITION;
    const [{ rows: cntBefore }] = await db.query(`SELECT COUNT(*) rows FROM ${TABLE}`);
    const [{ sumBefore }] = await db.query(
      `SELECT IFNULL(SUM(${COLUMN}),0) sumBefore FROM ${TABLE}`
    );
    log(`\n== 2. 迁移前 ==`);
    log(`  ${COLUMN} 当前位置：第 ${posCol} 列；${AFTER}：第 ${posAfter} 列`);
    log(`  订单行数：${cntBefore}；整备费合计：${sumBefore}`);

    if (posCol === posAfter + 1) {
      log(`\n  ${COLUMN} 已在 ${AFTER} 之后，无需调整。`);
      return;
    }

    /* ---------- 3. 调整列位置 ---------- */
    const meta = await getColumnMeta(db, TABLE, COLUMN);
    log(`\n== 3. 调整列位置 ==`);
    log(
      `  列定义：${meta.COLUMN_TYPE} / NULL=${meta.IS_NULLABLE} / DEFAULT=${meta.COLUMN_DEFAULT} / 注释=${meta.COLUMN_COMMENT}`
    );

    // 用参数化方式拼接注释，避免中文被转义；其余部分为固定标识符
    const ddl =
      `ALTER TABLE ${TABLE} MODIFY COLUMN ${COLUMN} ${meta.COLUMN_TYPE} ` +
      `${meta.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'} ` +
      `DEFAULT ${meta.COLUMN_DEFAULT === null ? 'NULL' : meta.COLUMN_DEFAULT} ` +
      `COMMENT ? AFTER ${AFTER}`;
    await db.query(ddl, [meta.COLUMN_COMMENT]);
    log(`  已执行：MODIFY COLUMN ${COLUMN} ... AFTER ${AFTER}`);

    /* ---------- 4. 校验 ---------- */
    const after = await getColumns(db, TABLE);
    const [{ rows: cntAfter }] = await db.query(`SELECT COUNT(*) rows FROM ${TABLE}`);
    const [{ sumAfter }] = await db.query(
      `SELECT IFNULL(SUM(${COLUMN}),0) sumAfter FROM ${TABLE}`
    );

    log(`\n== 4. 校验 ==`);
    log(`  订单行数：${cntBefore} → ${cntAfter} ${cntBefore === cntAfter ? '✅' : '❌'}`);
    log(`  整备费合计：${sumBefore} → ${sumAfter} ${String(sumBefore) === String(sumAfter) ? '✅' : '❌'}`);
    const posColNew = after.find((c) => c.COLUMN_NAME === COLUMN).ORDINAL_POSITION;
    log(`  新位置：第 ${posColNew} 列（期望 ${posAfter + 1}）${posColNew === posAfter + 1 ? '✅' : '❌'}`);

    log('\n  调整后前 14 列：');
    after.slice(0, 14).forEach((c, i) => log(`    ${String(i + 1).padStart(2)}. ${c.COLUMN_NAME}`));

    // 注释是否保留
    const metaNew = await getColumnMeta(db, TABLE, COLUMN);
    log(
      `\n  注释：${metaNew.COLUMN_COMMENT} ${metaNew.COLUMN_COMMENT === meta.COLUMN_COMMENT ? '✅' : '❌ 已丢失，请手工补回'}`
    );

    log('\n迁移完成。');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
