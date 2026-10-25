/**
 * 入参校验工具（v1.7.3）
 *
 * 放 utils 是因为它们不带业务语义、不查库，纯字符串/格式判断，
 * 结算（/checkout）与下单（/createOrder）共用同一份规则，避免两处口径不一致。
 */

/**
 * 手机号规范化：去首尾空格、去中间空格与连字符、去掉 +86 / 86 前缀
 * 例："138 0013-8000" → "13800138000"；"+8613800138000" → "13800138000"
 * @param {*} v
 * @returns {string} 规范化后的字符串（非法输入返回原样字符串，由校验函数判合法性）
 */
function normalizePhone(v) {
  if (v === undefined || v === null) return '';
  let s = String(v).trim().replace(/[\s-]/g, '');
  if (s.startsWith('+86')) {
    s = s.slice(3);
  } else if (s.startsWith('86') && s.length === 13) {
    s = s.slice(2);
  }
  return s;
}

/**
 * 订单联系人手机号校验（提交订单必填）
 * @param {*} v 原始入参
 * @returns {{ok:boolean, msg?:string, phone?:string}} ok 时 phone 为规范化后的手机号
 */
function validateContactPhone(v) {
  const phone = normalizePhone(v);
  if (!phone) {
    return { ok: false, msg: '请填写联系人手机号' };
  }
  // 兼容历史脏数据：前端曾把 undefined/null 直接当字符串传过来
  if (phone === 'undefined' || phone === 'null') {
    return { ok: false, msg: '请填写联系人手机号' };
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { ok: false, msg: '联系人手机号格式不正确，请填写 11 位手机号' };
  }
  return { ok: true, phone };
}

module.exports = { normalizePhone, validateContactPhone };
