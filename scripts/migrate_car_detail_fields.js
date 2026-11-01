/**
 * v1.7.6 车辆详情页字段迁移脚本
 *
 * 背景：小程序要新增「车辆详情页」（列表页与结算页之间），需要轮播图、标签、配置参数，
 * 而 `pp_car` 目前只有单张 `image_url` 与一段自由文本 `des`，撑不起详情页。
 *
 * 本脚本给 pp_car 增加三个 **JSON 列**（MySQL 5.7.44 支持 JSON 类型）：
 *   - images  JSON 数组：详情页轮播图，如 ["https://.../a.jpg","https://.../b.jpg"]，最多 8 张
 *   - tags    JSON 数组：车辆标签，如 ["自动挡","5座","豪华型"]，最多 6 个
 *   - config  JSON 对象：配置参数键值对，如 {"座位":"5座","排量":"2.0T","变速箱":"自动"}，最多 20 项
 *
 * 兼容性：
 *   - 三列均为 NULL 允许，**不改动任何既有字段**；老代码无感知
 *   - 回填：把现有 `image_url` 写进 `images`，保证老车辆详情页也有图可轮播
 *   - C 端读取时 `images` 为空会回退到 `[image_url]`（见 services/car.service.js）
 *
 * 安全设计：① 先建库内备份表；② 加列幂等（已存在则跳过）；③ 回填只处理 images 为 NULL 的行
 * 用法：node scripts/migrate_car_detail_fields.js
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
    // 中文注释必须显式声明连接字符集，否则注释可能以错误编码写入（v1.6.6 踩过）
    await db.query('SET NAMES utf8mb4');

    /* ---------- 1. 备份（库内备份表） ---------- */
    log('== 1. 备份 ==');
    const bak = `pp_car_bak_${STAMP}`;
    const [exists] = await db.query(
      'SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      [bak]
    );
    if (exists.n === 0) {
      await db.query(`CREATE TABLE ${bak} AS SELECT * FROM pp_car`);
      const [{ n }] = await db.query(`SELECT COUNT(*) n FROM ${bak}`);
      log(`  已建备份表 ${bak}（${n} 行）`);
    } else {
      log(`  备份表已存在，跳过：${bak}`);
    }

    /* ---------- 2. 新增三个 JSON 列 ---------- */
    log('== 2. pp_car 新增详情页字段 ==');
    const cols = [
      { name: 'images', comment: '车辆轮播图（JSON 数组，最多 8 张，第 1 张为列表主图）' },
      { name: 'tags', comment: '车辆标签（JSON 数组，最多 6 个，如 自动挡/5座/豪华型）' },
      { name: 'config', comment: '车辆配置参数（JSON 对象，键值对，如 座位/排量/变速箱，最多 20 项）' },
    ];
    for (const c of cols) {
      if (await hasColumn(db, 'pp_car', c.name)) {
        log(`  已存在，跳过：pp_car.${c.name}`);
        continue;
      }
      await db.query(`ALTER TABLE pp_car ADD COLUMN ${c.name} JSON NULL COMMENT '${c.comment}'`);
      log(`  已新增 pp_car.${c.name}（JSON，允许为空）`);
    }

    /* ---------- 3. 回填：把 image_url 作为第一张轮播图 ---------- */
    log('== 3. 回填历史车辆的轮播图 ==');
    const res = await db.query(
      `UPDATE pp_car SET images = JSON_ARRAY(image_url)
       WHERE images IS NULL AND image_url IS NOT NULL AND image_url <> ''`
    );
    log(`  已回填 ${res.affectedRows} 辆（把 image_url 写为 images 第 1 张）`);

    /* ---------- 4. 校验 ---------- */
    log('== 4. 校验 ==');
    const [{ total }] = await db.query('SELECT COUNT(*) total FROM pp_car');
    const [{ withImages }] = await db.query('SELECT COUNT(*) withImages FROM pp_car WHERE images IS NOT NULL');
    const [{ withTags }] = await db.query('SELECT COUNT(*) withTags FROM pp_car WHERE tags IS NOT NULL');
    const [{ withConfig }] = await db.query('SELECT COUNT(*) withConfig FROM pp_car WHERE config IS NOT NULL');
    log(`  车辆总数 ${total}；已有轮播图 ${withImages}；已有标签 ${withTags}（应为 0，待运营录入）；已有配置 ${withConfig}（应为 0，待运营录入）`);

    const sample = await db.query('SELECT id, car_name, images FROM pp_car ORDER BY id LIMIT 3');
    log('  样例：');
    sample.forEach((c) => log(`    #${c.id} ${c.car_name} → ${JSON.stringify(c.images)}`));

    log('\n迁移完成。接下来在后台「车辆管理」里给车辆补标签与配置参数即可。');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
