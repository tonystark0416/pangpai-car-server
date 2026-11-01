/**
 * 车辆领域服务（v1.7.6）
 *
 * 只做一件事：把 `pp_car` 的三个 JSON 列（images / tags / config）**归一化**，
 * 供后台写入与 C 端读取共用同一套规则，避免「后台写进去的格式」和「前端拿到的格式」不一致。
 *
 * 为什么需要归一化：JSON 列可以存任意结构，运营/接口调用方可能传字符串、对象、超长数组，
 * 直接在接口层吐给小程序会导致前端渲染崩溃（尤其 `images.map is not a function`）。
 *
 * 口径：
 *   images —— 字符串数组，最多 8 张，第 1 张即列表与详情的**主图**
 *   tags   —— 字符串数组，最多 6 个，单个 ≤ 10 字
 *   config —— 键值对对象，最多 20 项（前端按对象顺序渲染配置表）
 */
const MAX_IMAGES = 8;
const MAX_TAGS = 6;
const MAX_TAG_LEN = 10;
const MAX_CONFIG_ITEMS = 20;
const MAX_URL_LEN = 500;

/** 解析可能是 JSON 字符串 / 已解析对象 / null 的值 */
function parseMaybeJson(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch (e) {
      return null;
    }
  }
  return v;
}

/**
 * 归一化轮播图
 * @param {*} v 入参（数组 / JSON 字符串 / 逗号分隔字符串）
 * @param {string} [fallbackUrl] 为空时的兜底图（通常是 image_url）
 * @returns {string[]}
 */
function normalizeImages(v, fallbackUrl) {
  let raw = parseMaybeJson(v);
  // 不是合法 JSON 时，兼容「用逗号分隔传一整串」的写法（如 "https://a.jpg,https://b.jpg"）
  if (raw === null) raw = typeof v === 'string' && v ? v : [];
  if (!Array.isArray(raw)) {
    raw = String(raw).split(',');
  }
  const list = raw
    .map((s) => String(s || '').trim())
    .filter((s) => s && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')))
    .slice(0, MAX_IMAGES);
  if (list.length) return list;
  return fallbackUrl ? [String(fallbackUrl)] : [];
}

/**
 * 归一化标签
 * @param {*} v 入参（数组 / JSON 字符串 / 逗号分隔字符串）
 * @returns {string[]}
 */
function normalizeTags(v) {
  let raw = parseMaybeJson(v);
  // 兼容「用逗号分隔传一整串」的写法（如 "自动挡,5座"）
  if (raw === null) raw = typeof v === 'string' && v ? v : [];
  if (!Array.isArray(raw)) {
    raw = String(raw).split(',');
  }
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const s = String(item || '').trim().slice(0, MAX_TAG_LEN);
    if (s && !seen.has(s)) {
      seen.add(s);
      list.push(s);
    }
    if (list.length >= MAX_TAGS) break;
  }
  return list;
}

/**
 * 归一化配置参数
 * @param {*} v 入参（对象 / JSON 字符串）
 * @returns {object} 键值对（key/value 均为字符串）
 */
function normalizeConfig(v) {
  const raw = parseMaybeJson(v);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw)
    .slice(0, MAX_CONFIG_ITEMS)
    .forEach((k) => {
      const key = String(k).trim();
      const val = raw[k];
      if (!key) return;
      const text = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '').trim();
      if (text) out[key.slice(0, 20)] = text.slice(0, 50);
    });
  return out;
}

/**
 * 给 C 端输出车辆对象：补上轮播图 / 标签 / 配置
 *
 * `images` 为空时自动回退为 `[image_url]`——老车辆只有单图，
 * 详情页轮播组件拿到至少 1 张图，不会出现空白。
 *
 * @param {object} car pp_car 行
 * @returns {object} 新对象（不改动入参）
 */
function decorateCar(car) {
  if (!car) return car;
  return {
    ...car,
    images: normalizeImages(car.images, car.image_url),
    tags: normalizeTags(car.tags),
    config: normalizeConfig(car.config),
  };
}

module.exports = {
  MAX_IMAGES,
  MAX_TAGS,
  MAX_TAG_LEN,
  MAX_CONFIG_ITEMS,
  MAX_URL_LEN,
  normalizeImages,
  normalizeTags,
  normalizeConfig,
  decorateCar,
};
