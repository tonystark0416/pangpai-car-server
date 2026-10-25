/**
 * 管理后台：优惠券管理（v1.7.3）
 *
 * 批次状态流转：未开始(0) → 活动中(1) → 已废弃(2)，已废弃不可逆；
 * 废弃时会连带把用户已领未用的券一并作废。
 */
const coupon = require('../../models/coupon.model');

/** 批次创建/编辑的参数校验（两侧共用） */
function validateCouponInput(p, { partial = false } = {}) {
  const has = (k) => p[k] !== undefined && p[k] !== null && p[k] !== '';

  if (!partial || has('name')) {
    if (!has('name') || String(p.name).trim() === '') return '券名称不能为空';
  }
  if (!partial || has('amount')) {
    if (Number.isNaN(Number(p.amount)) || Number(p.amount) <= 0) return '面额必须为大于 0 的数字';
  }
  if (!partial || has('total_stock')) {
    const stock = Number(p.total_stock);
    if (!Number.isInteger(stock) || stock <= 0) return '库存必须为大于 0 的整数';
  }
  if (has('threshold') && (Number.isNaN(Number(p.threshold)) || Number(p.threshold) < 0)) {
    return '使用门槛不能为负数';
  }
  if (has('per_limit') && (!Number.isInteger(Number(p.per_limit)) || Number(p.per_limit) < 1)) {
    return '每人限领张数必须为不小于 1 的整数';
  }
  if (has('use_per_limit') && (!Number.isInteger(Number(p.use_per_limit)) || Number(p.use_per_limit) < 1)) {
    return '每人可用张数必须为不小于 1 的整数';
  }
  if (has('scope_type') && ![1, 2].includes(Number(p.scope_type))) {
    return '使用范围只能为 1（全场）或 2（指定车辆）';
  }
  if (Number(p.scope_type) === 2 && !has('scope_car_ids')) {
    return '指定车辆时必须选择适用车辆';
  }
  if (has('user_scope') && ![0, 1, 2].includes(Number(p.user_scope))) {
    return '适用人群只能为 0（全部）/1（新用户）/2（老用户）';
  }

  const pairs = [
    ['receive_start_time', 'receive_end_time', '领取'],
    ['use_start_time', 'use_end_time', '使用'],
  ];
  for (const [startKey, endKey, label] of pairs) {
    if (has(startKey) && has(endKey)) {
      if (new Date(p[startKey]) >= new Date(p[endKey])) {
        return `${label}结束时间必须晚于${label}开始时间`;
      }
    }
  }
  return null;
}

/** 批次列表 */
async function list(req, res) {
  const { page = 1, pageSize = 10, name, status } = req.query;
  const data = await coupon.getCouponList({ page, pageSize, name, status });
  const list = data.list.map((r) => ({
    ...r,
    amount: Number(r.amount),
    status_text: coupon.COUPON_STATUS_TEXT[r.status],
    scope_text: Number(r.scope_type) === 1 ? '全场通用' : '指定车辆',
    bear_text: r.bear_type === 'platform' ? '平台承担' : r.bear_type,
  }));
  res.json({ code: 0, data: { list, total: data.total } });
}

/** 批次详情 */
async function detail(req, res) {
  const row = await coupon.getCouponById(req.params.id);
  if (!row) {
    return res.json({ code: 404, msg: '优惠券批次不存在' });
  }
  res.json({ code: 0, data: row });
}

/** 创建批次 */
async function create(req, res) {
  const p = req.body || {};
  const err = validateCouponInput(p);
  if (err) {
    return res.json({ code: 400, msg: err });
  }
  const row = await coupon.createCoupon(p);
  if (!row) {
    return res.json({ code: 500, msg: '优惠券创建失败' });
  }
  res.json({ code: 0, data: row });
}

/** 编辑批次（活动中的券只允许追加库存，避免用户已领权益被改） */
async function update(req, res) {
  const p = req.body || {};
  const err = validateCouponInput(p, { partial: true });
  if (err) {
    return res.json({ code: 400, msg: err });
  }
  const ret = await coupon.updateCoupon(req.params.id, p);
  if (ret === -1) return res.json({ code: 404, msg: '优惠券批次不存在' });
  if (ret === -2) return res.json({ code: 400, msg: '活动中的券只能追加库存，不能修改规则' });
  res.json({ code: 0, data: { id: Number(req.params.id) } });
}

/** 切换状态：开始活动 / 废弃 */
async function updateStatus(req, res) {
  const ret = await coupon.updateCouponStatus(req.params.id, req.body.status);
  if (ret === -1) return res.json({ code: 404, msg: '优惠券批次不存在' });
  if (ret === -2) return res.json({ code: 400, msg: '非法的状态流转（已废弃的券不可再启用）' });
  res.json({ code: 0, data: { id: Number(req.params.id), status: Number(req.body.status) } });
}

module.exports = { list, detail, create, update, updateStatus };
