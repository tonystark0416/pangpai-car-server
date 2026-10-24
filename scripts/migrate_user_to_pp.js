/**
 * 用户表拆分迁移脚本（v1.6.15）
 *
 * 背景：庞派租车此前与另一个项目共用 adp_user / adp_user_auth / adp_admin_user，
 * 现将庞派自己的用户体系拆到 pp_user / pp_user_auth / pp_admin_user，adp_ 表保留给其他项目。
 *
 * 设计要点：
 *   1. **保留原主键 id**：pp_order.uid、pp_driver.user_id 都依赖用户 id，必须一一对应
 *   2. **只迁庞派的数据**：有 pp 授权的用户 ∪ 被 pp_order / pp_driver 引用的用户
 *   3. **不动 adp_ 任何数据**：只做 SELECT + INSERT，不删不改进表
 *   4. **幂等**：可重复执行，用于切换代码前补齐窗口期新增的用户
 *
 * 用法：node scripts/migrate_user_to_pp.js
 */
const fs = require('fs');
const path = require('path');
const MySQL = require('../src/utils/mysql');

const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // 20261024
const TABLES = ['adp_user', 'adp_user_auth', 'adp_admin_user'];
const TARGET = { adp_user: 'pp_user', adp_user_auth: 'pp_user_auth', adp_admin_user: 'pp_admin_user' };

/** 生成 INSERT 语句，用于离线备份文件 */
function escapeVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function main() {
  const db = new MySQL();
  const log = (...a) => console.log(...a);

  try {
    /* ---------- 1. 备份（库内备份表 + 离线 SQL 文件） ---------- */
    log('== 1. 备份 ==');
    for (const t of TABLES) {
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

    const dumpLines = ['-- 庞派用户表拆分前备份（自动生成，勿删）', `-- 生成时间：${new Date().toISOString()}`, ''];
    for (const t of TABLES) {
      const rows = await db.query(`SELECT * FROM ${t}`);
      dumpLines.push(`-- ${t} (${rows.length} 行)`);
      rows.forEach((r) => {
        const keys = Object.keys(r);
        dumpLines.push(
          `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map((k) => escapeVal(r[k])).join(', ')});`
        );
      });
      dumpLines.push('');
    }
    const dumpPath = path.join(__dirname, `db-backup-before-pp-user-${STAMP}.sql`);
    fs.writeFileSync(dumpPath, dumpLines.join('\n'), 'utf8');
    log(`  离线备份已写出：${dumpPath}`);

    /* ---------- 2. 建新表（结构/索引与 adp_ 一致） ---------- */
    log('== 2. 建 pp_ 新表 ==');
    for (const [src, dst] of Object.entries(TARGET)) {
      const [exists] = await db.query(
        `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
        [dst]
      );
      if (exists.n === 0) {
        await db.query(`CREATE TABLE ${dst} LIKE ${src}`);
        log(`  已创建 ${dst}（结构复制自 ${src}）`);
      } else {
        log(`  已存在，跳过：${dst}`);
      }
    }

    /* ---------- 3. 迁移数据（保留原 id，幂等） ---------- */
    log('== 3. 迁移数据 ==');

    // 3.1 用户主表：有 pp 授权的用户 ∪ 被订单/驾驶证引用的用户
    const userRes = await db.query(
      `INSERT INTO pp_user SELECT * FROM adp_user u
       WHERE NOT EXISTS (SELECT 1 FROM pp_user p WHERE p.id = u.id)
         AND (EXISTS (SELECT 1 FROM adp_user_auth a WHERE a.user_id = u.id AND a.biz_code = 'pp')
              OR EXISTS (SELECT 1 FROM pp_order o WHERE o.uid = u.id)
              OR EXISTS (SELECT 1 FROM pp_driver d WHERE d.user_id = u.id))`
    );
    log(`  pp_user 新增 ${userRes.affectedRows} 行`);

    // 3.2 授权表：只迁已迁用户的授权行
    const authRes = await db.query(
      `INSERT INTO pp_user_auth SELECT * FROM adp_user_auth a
       WHERE a.user_id IN (SELECT id FROM pp_user)
         AND NOT EXISTS (SELECT 1 FROM pp_user_auth p WHERE p.id = a.id)`
    );
    log(`  pp_user_auth 新增 ${authRes.affectedRows} 行`);

    // 3.3 管理员表：全量（庞派后台独立）
    const adminRes = await db.query(
      `INSERT INTO pp_admin_user SELECT * FROM adp_admin_user x
       WHERE NOT EXISTS (SELECT 1 FROM pp_admin_user p WHERE p.id = x.id)`
    );
    log(`  pp_admin_user 新增 ${adminRes.affectedRows} 行`);

    /* ---------- 4. 设置自增起点，避免与旧 id 撞号 ---------- */
    log('== 4. 设置自增起点 ==');
    for (const dst of Object.values(TARGET)) {
      const [{ n }] = await db.query(`SELECT IFNULL(MAX(id), 0) n FROM ${dst}`);
      const next = Math.max(n + 1, 1);
      await db.query(`ALTER TABLE ${dst} AUTO_INCREMENT = ?`, [next]);
      log(`  ${dst} AUTO_INCREMENT = ${next}`);
    }

    /* ---------- 5. 校验 ---------- */
    log('== 5. 校验 ==');
    const [{ srcUser }] = await db.query(`SELECT COUNT(*) srcUser FROM adp_user`);
    const [{ dstUser }] = await db.query(`SELECT COUNT(*) dstUser FROM pp_user`);
    const [{ dstAuth }] = await db.query(`SELECT COUNT(*) dstAuth FROM pp_user_auth`);
    const [{ dstAdmin }] = await db.query(`SELECT COUNT(*) dstAdmin FROM pp_admin_user`);
    log(`  adp_user=${srcUser} → pp_user=${dstUser}（授权行 ${dstAuth}、管理员 ${dstAdmin}）`);

    // 订单/驾驶证是否都能关联到人
    const [{ orderTotal, orderHit }] = await db.query(
      `SELECT COUNT(*) orderTotal,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM pp_user p WHERE p.id = o.uid) THEN 1 ELSE 0 END) orderHit
       FROM pp_order o`
    );
    log(`  订单关联：${orderHit}/${orderTotal} 笔 uid 能在 pp_user 找到`);

    const [{ driverTotal, driverHit }] = await db.query(
      `SELECT COUNT(*) driverTotal,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM pp_user p WHERE p.id = d.user_id) THEN 1 ELSE 0 END) driverHit
       FROM pp_driver d`
    );
    log(`  驾驶证关联：${driverHit}/${driverTotal} 条 user_id 能在 pp_user 找到`);

    // id 一致性抽查
    const mismatch = await db.query(
      `SELECT p.id, p.phone, p.nickname FROM pp_user p
       WHERE EXISTS (SELECT 1 FROM adp_user a WHERE a.id = p.id)
         AND NOT EXISTS (SELECT 1 FROM adp_user a WHERE a.id = p.id
                          AND IFNULL(a.phone,'') = IFNULL(p.phone,'')
                          AND IFNULL(a.nickname,'') = IFNULL(p.nickname,''))`
    );
    log(`  id 一致且字段比对不一致的行数：${mismatch.length}（应为 0）`);

    log('\n迁移完成。注意：adp_ 表数据未做任何删除或修改。');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
