/**
 * 时间格式化工具（v1.7.5）
 *
 * 背景：mysql2 未配 timezone，DATETIME 经 JSON 序列化后是 **ISO UTC 串**，
 * 直接吐给前端会差 8 小时（东八区）。后端新接口输出时间字段时统一走这里。
 *
 * 与前端 `admin-web/src/utils/format.js` 的 formatDateTime 输出格式保持一致：
 * `YYYY-MM-DD HH:mm:ss`，空值/0 返回空串。
 */

/**
 * 格式化为东八区时间字符串
 * @param {string|Date|number} v ISO 串 / Date / 毫秒时间戳
 * @param {number} [offsetHours] 时区偏移小时，默认 8（东八区）
 * @returns {string} 'YYYY-MM-DD HH:mm:ss'，无法解析时返回空串
 */
function formatDateTime(v, offsetHours = 8) {
  if (v === undefined || v === null || v === '' || v === 0) return '';
  const d = v instanceof Date ? v : new Date(v);
  const ts = d.getTime();
  if (!Number.isFinite(ts)) return '';

  // 统一按 UTC 取值后加上时区偏移，避免依赖服务器本地时区
  const t = new Date(ts + offsetHours * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} `
    + `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}

module.exports = { formatDateTime };
