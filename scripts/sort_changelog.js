/**
 * Change Log 排序工具
 *
 * 背景：两份文档的 Change Log 历史上是「往后追加」的（越新的版本在越下面），
 * 而后续迭代时又有把新条目插在最上面的写法，两种方向混在一起导致表格顺序错乱；
 * api 文档的表格里甚至混进了一行多余的分隔符，把 Change Log 从中间截成两截。
 * 前端同学按表格从上往下读会以为版本是倒着走的，所以统一按版本号排序。
 *
 * 用法：
 *   node scripts/sort_changelog.js          # 排序（默认降序：最新版本在最上面）
 *   node scripts/sort_changelog.js asc      # 升序（最新版本在最下面，即旧的追加式写法）
 *
 * 说明：
 *   - 只处理 `#` 级别标题里带 "Change Log" 的那一节，文档其余部分不动
 *   - 同版本的多条记录保持原有相对顺序（稳定排序）
 *   - 顺带清理表格内部多余的分隔行（`|---|---|`）
 */
const fs = require('fs');
const path = require('path');

const TARGETS = ['docs/requirements.md', 'docs/api-for-miniprogram.md'];

const HEADING_RE = /^##\s+.*Change Log/i;
const HEADER_RE = /^\|.*版本/;
const SEP_RE = /^\|[\s\-:|]+$/;

/** 取首列版本号 → [major, minor, patch]，取不到返回 null */
function parseVersion(line) {
  const m = line.match(/^\|\s*v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 版本号三元组比较 */
function compareVersion(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function sortFile(file, order) {
  const abs = path.resolve(process.cwd(), file);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');

  const headIdx = lines.findIndex((l) => HEADING_RE.test(l));
  if (headIdx === -1) {
    console.log(`✗ ${file}：未找到 Change Log 标题，跳过`);
    return;
  }

  // 标题之后找到表头（允许中间有说明文字）
  let headerIdx = -1;
  for (let i = headIdx + 1; i < lines.length; i += 1) {
    if (HEADER_RE.test(lines[i])) {
      headerIdx = i;
      break;
    }
    // 遇到下一个章节或水平分割线就放弃
    if (/^#{1,6}\s/.test(lines[i]) || /^---\s*$/.test(lines[i])) break;
  }
  if (headerIdx === -1) {
    console.log(`✗ ${file}：未找到 Change Log 表头，跳过`);
    return;
  }

  const sepIdx = headerIdx + 1;
  if (!SEP_RE.test(lines[sepIdx] || '')) {
    console.log(`✗ ${file}：表头之后不是分隔行，跳过`);
    return;
  }

  // 收集数据行（顺带丢弃多余的分隔行）
  let end = sepIdx + 1;
  const rows = [];
  let droppedSep = 0;
  while (end < lines.length && lines[end].trim().startsWith('|')) {
    if (SEP_RE.test(lines[end])) {
      droppedSep += 1;
    } else {
      rows.push(lines[end]);
    }
    end += 1;
  }

  const parsed = rows.map((line, idx) => ({ line, idx, ver: parseVersion(line) }));
  const known = parsed.filter((r) => r.ver);
  const unknown = parsed.filter((r) => !r.ver);

  const dir = order === 'asc' ? 1 : -1;
  known.sort((a, b) => {
    const c = compareVersion(a.ver, b.ver);
    return c !== 0 ? c * dir : a.idx - b.idx; // 版本相同时保持原有顺序
  });

  const sorted = [...known.map((r) => r.line), ...unknown.map((r) => r.line)];
  const next = [...lines.slice(0, sepIdx + 1), ...sorted, ...lines.slice(end)];

  if (next.join('\n') === lines.join('\n')) {
    console.log(`· ${file}：Change Log 已是${order === 'asc' ? '升' : '降'}序，无需调整`);
    return;
  }

  fs.writeFileSync(abs, next.join('\n'), 'utf8');
  const firstVer = sorted[0] ? (parseVersion(sorted[0]) || []).join('.') : '?';
  console.log(
    `✓ ${file}：已按版本号${order === 'asc' ? '升' : '降'}序重排 ${sorted.length} 条` +
      `（最新在最${order === 'asc' ? '下' : '上'}，首条 v${firstVer}）` +
      (droppedSep ? `；清理多余分隔行 ${droppedSep} 行` : '') +
      (unknown.length ? `；${unknown.length} 行无版本号已保持相对位置排在最后` : '')
  );
}

const order = process.argv[2] === 'asc' ? 'asc' : 'desc';
TARGETS.forEach((f) => sortFile(f, order));
