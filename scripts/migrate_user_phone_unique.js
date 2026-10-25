/**
 * v1.7.0 账号体系迁移：手机号成为账号唯一标识
 *
 * 背景：新登录流程改为「微信手机号快速验证 → 按手机号注册/登录 → 绑定 openid/unionid」，
 * 因此 pp_user.phone 必须唯一；另外历史上删除 pp_user 行不会级联删 pp_user_auth，
 * 留下孤儿授权行会让该 openid 永久登录失败，需一并清理。
 *
 * 本脚本做三件事（全部幂等）：
 *   1. 清理孤儿授权行（auth.user_id 在 pp_user 中已不存在）—— 删除前先离线导出为 SQL
 *   2. pp_user.phone 的空串统一转为 NULL（唯一索引下多个 '' 会冲突，多个 NULL 不冲突）
 *   3. 给 pp_user.phone 加唯一索引 uk_phone（已存在则跳过）
 *
 * 安全：涉及删除/加索引前都会先检测；有重复手机号时**中止**并打印，绝不强行建索引。
 * 用法：node scripts/migrate_user_phone_unique.js
 * 回滚：ALTER TABLE pp_user DROP INDEX uk_phone;
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const MySQL = require('../src/utils/mysql');

const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/** 索引是否已存在 */
async function hasIndex(db, table, indexName) {
  const [row] = await db.query(
    `SELECT COUNT(*) n FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return row.n > 0;
}

async function main() {
  const db = new MySQL();
  const log = (...a) => console.log(...a);

  try {
    /* ---------- 1. 清理孤儿授权行 ---------- */
    log('== 1. 清理孤儿授权行 ==');
    const orphans = await db.query(
      `SELECT a.* FROM pp_user_auth a LEFT JOIN pp_user u ON u.id = a.user_id
       WHERE u.id IS NULL ORDER BY a.id`
    );
    if (!orphans.length) {
      log('  无孤儿授权行，跳过');
    } else {
      const outFile = path.join(os.homedir(), `pp_orphan_auth_${STAMP}.sql`);
      const cols = Object.keys(orphans[0]);
      const sql =
        `-- 孤儿授权行离线导出 ${new Date().toISOString()}\n` +
        `INSERT INTO pp_user_auth (\`${cols.join('`,`')}\`) VALUES\n` +
        orphans.map((r) => `  (${cols.map((c) => esc(r[c])).join(',')})`).join(',\n') +
        ';\n';
      fs.writeFileSync(outFile, sql, 'utf8');
      log(`  发现 ${orphans.length} 条孤儿授权行，已导出至 ${outFile}`);
      orphans.forEach((r) => log(`    auth_id=${r.id} user_id=${r.user_id} openid=${r.openid}`));
      for (const r of orphans) {
        await db.query('DELETE FROM pp_user_auth WHERE id = ?', [r.id]);
      }
      const [left] = await db.query(
        `SELECT COUNT(*) n FROM pp_user_auth a LEFT JOIN pp_user u ON u.id = a.user_id WHERE u.id IS NULL`
      );
      log(`  已删除，剩余孤儿行：${left.n}（应为 0）`);
    }

    /* ---------- 2. phone 空串转 NULL ---------- */
    log('\n== 2. phone 空串转 NULL ==');
    const res = await db.query("UPDATE pp_user SET phone = NULL WHERE phone = ''");
    log(`  转换 ${res.affectedRows} 行`);

    /* ---------- 3. 重复手机号检测 ---------- */
    log('\n== 3. 重复手机号检测 ==');
    const dups = await db.query(
      `SELECT phone, COUNT(*) n FROM pp_user WHERE phone IS NOT NULL GROUP BY phone HAVING n > 1`
    );
    if (dups.length) {
      log(`  发现 ${dups.length} 个重复手机号，无法建唯一索引，已中止：`);
      dups.forEach((d) => log(`    ${d.phone} × ${d.n}`));
      log('  请先人工合并这些账号后再重跑本脚本。');
      return;
    }
    const [{ hasPhone }] = await db.query('SELECT COUNT(*) hasPhone FROM pp_user WHERE phone IS NOT NULL');
    log(`  无重复手机号（有号码用户 ${hasPhone} 个）`);

    /* ---------- 4. 唯一索引 ---------- */
    log('\n== 4. 唯一索引 uk_phone ==');
    if (await hasIndex(db, 'pp_user', 'uk_phone')) {
      log('  已存在，跳过');
    } else {
      await db.query('ALTER TABLE pp_user ADD UNIQUE KEY uk_phone (phone)');
      log('  已添加 pp_user.uk_phone(phone)');
    }

    /* ---------- 5. 校验 ---------- */
    const [{ idx }] = await db.query(
      `SELECT COUNT(*) idx FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pp_user' AND INDEX_NAME = 'uk_phone'`
    );
    const [ddl] = await db.query('SHOW CREATE TABLE pp_user');
    log(`\n== 5. 校验 ==\n  唯一索引存在：${idx > 0 ? '✅' : '❌'}`);
    log(ddl['Create Table'].split('\n').filter((l) => l.includes('uk_phone')).join('\n'));

    log('\n迁移完成。回滚命令：ALTER TABLE pp_user DROP INDEX uk_phone;');
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
