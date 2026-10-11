/**
 * 通用格式化工具
 */

/**
 * 时间格式化：YYYY-MM-DD HH:mm:ss（浏览器本地时区，东八区即北京时间）
 * 兼容：ISO 字符串（2026-10-11T13:13:59.000Z）、毫秒时间戳字符串、Date 对象
 * 空值返回 '-'，无法解析时原样返回
 */
export function formatDateTime(value) {
  if (value === null || value === undefined || value === '' || value === 0) return '-';
  const raw = value instanceof Date ? value : new Date(/^\d+(\.\d+)?$/.test(String(value)) ? Number(value) : value);
  if (Number.isNaN(raw.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${raw.getFullYear()}-${p(raw.getMonth() + 1)}-${p(raw.getDate())} ${p(raw.getHours())}:${p(raw.getMinutes())}:${p(raw.getSeconds())}`;
}
