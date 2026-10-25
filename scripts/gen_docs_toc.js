/**
 * 文档目录（TOC）生成与校验工具
 *
 * 背景：docs/requirements.md 与 docs/api-for-miniprogram.md 章节越来越多，
 * 手工维护目录很容易写出**跳不过去的锚点**（GitHub 的 slug 规则并不直观：⭐ 会保留、
 * 连续空格会变成连续连字符、加粗/斜杠等符号的处理也容易记错）。
 * 本工具按 GitHub GFM 的 slug 规则生成锚点，保证链接可跳转。
 *
 * 用法：
 *   node scripts/gen_docs_toc.js check                      # 校验两份文档的 TOC 锚点是否全部有效
 *   node scripts/gen_docs_toc.js print docs/requirements.md # 打印目录文本（粘贴用）
 *   node scripts/gen_docs_toc.js update                     # 就地重写两份文档里的「目录」区块
 *
 * 约定：文档中的目录区块形如
 *   ## 目录
 *   （若干 - [标题](#锚点) 行）
 *   ---
 * update 只替换标题行之后的连续列表行，其余内容不动。
 */
const fs = require('fs');
const path = require('path');

const DOCS = [
  { file: 'docs/requirements.md', tocHeading: '## 目录', maxLevel: 3 },
  { file: 'docs/api-for-miniprogram.md', tocHeading: '### 目录', maxLevel: 4 },
];

/**
 * GFM slug：转小写 → 删除标点/符号 → 空白转连字符。
 * 注意：连续空白会产生连续连字符（GitHub 不做折叠），这里必须保持一致。
 */
function slug(text) {
  return text
    .replace(/<[^>]*>/g, '') // 去 HTML 标签
    .replace(/\*\*?/g, '') // 去 markdown 强调符号
    .replace(/`([^`]*)`/g, '$1') // 去行内代码反引号
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\]^`{|}~]/g, (m) => (m === '-' ? '-' : ''))
    .replace(/[，。：；、？！「」『』（）【】《》·—…￥“”‘’]/g, '')
    .replace(/^-|-$/g, '');
}

/** 提取文档中所有标题（跳过代码块内的 # 注释行） */
function collectHeadings(lines, maxLevel) {
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,6})\s+(.*)$/);
    if (!m) continue;
    const level = m[1].length;
    if (level > maxLevel) continue;
    const raw = m[2].trim();
    out.push({ level, title: raw.replace(/\*\*/g, ''), slug: slug(raw) });
  }
  return out;
}

/** 目录区块：跳过目录标题自身所在的层级，避免出现自引用 */
function buildToc(headings, baseLevel) {
  return headings
    .filter((h) => h.title !== '目录' && h.title !== '文档说明与目录' && h.title !== '文档地图（本文 vs 小程序接口文档）')
    .map((h) => `${'  '.repeat(h.level - baseLevel)}- [${h.title}](#${h.slug})`)
    .join('\n');
}

/** 找到「目录标题」之后连续的列表行区间 [start, end) */
function findTocBlock(lines, tocHeading) {
  const start = lines.findIndex((l) => l.trim() === tocHeading);
  if (start === -1) return null;
  let i = start + 1;
  while (i < lines.length && lines[i].trim() === '') i += 1; // 跳过空行
  const listStart = i;
  let end = listStart;
  while (end < lines.length && /^\s*-\s+\[.*\]\(#.*\)\s*$/.test(lines[end])) end += 1;
  return { start, listStart, end };
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n');
}

function cmdCheck() {
  let badTotal = 0;
  DOCS.forEach(({ file, maxLevel }) => {
    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs)) {
      console.log(`✗ 文件不存在：${file}`);
      return;
    }
    const lines = readLines(abs);
    const headings = collectHeadings(lines, maxLevel);
    const slugSet = new Map(headings.map((h) => [h.slug, h.title]));

    const linkRe = /\[([^\]]+)\]\(#([^)]+)\)/g;
    let bad = 0;
    lines.forEach((line) => {
      let m;
      while ((m = linkRe.exec(line)) !== null) {
        if (!slugSet.has(m[2])) {
          bad += 1;
          console.log(`✗ ${file} 锚点无效：#${m[2]}（链接文本「${m[1]}」）`);
          const hint = [...slugSet.keys()].find((k) => k.includes(m[2].slice(0, 6)));
          if (hint) console.log(`   可能应为：#${hint}`);
        }
      }
    });
    badTotal += bad;
    if (bad === 0) console.log(`✓ ${file}：TOC 链接全部有效（${headings.length} 个标题）`);
  });
  process.exit(badTotal === 0 ? 0 : 1);
}

function cmdPrint(fileArg, levelArg) {
  const abs = path.resolve(process.cwd(), fileArg);
  const maxLevel = Number(levelArg || 3);
  const baseLevel = maxLevel >= 4 ? 2 : 2;
  console.log(buildToc(collectHeadings(readLines(abs), maxLevel), baseLevel));
}

function cmdUpdate() {
  DOCS.forEach(({ file, tocHeading, maxLevel }) => {
    const abs = path.resolve(process.cwd(), file);
    const lines = readLines(abs);
    const block = findTocBlock(lines, tocHeading);
    if (!block) {
      console.log(`✗ ${file}：未找到目录标题「${tocHeading}」，跳过`);
      return;
    }
    const headings = collectHeadings(lines, maxLevel);
    const toc = buildToc(headings, 2).split('\n');
    const next = [...lines.slice(0, block.listStart), ...toc, ...lines.slice(block.end)];
    if (next.join('\n') === lines.join('\n')) {
      console.log(`· ${file}：目录无变化`);
      return;
    }
    fs.writeFileSync(abs, next.join('\n'), 'utf8');
    console.log(`✓ ${file}：目录已更新（${toc.length} 条）`);
  });
}

const [, , cmd, arg1, arg2] = process.argv;
if (cmd === 'check') cmdCheck();
else if (cmd === 'print') cmdPrint(arg1, arg2);
else if (cmd === 'update') cmdUpdate();
else {
  console.log('用法：node scripts/gen_docs_toc.js <check|print|update> [file] [level]');
  process.exit(1);
}
