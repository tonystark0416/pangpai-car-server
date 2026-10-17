/**
 * 管理后台：订单管理 + 概览统计
 */
const adminModel = require('../../models/admin.model');
const refundService = require('../../services/refund.service');

// 履约状态合法值
const ORDER_STATUS = [0, 1, 2, 3, 4];

async function list(req, res) {
  const { page, pageSize, pay_status, order_status, keyword } = req.query;
  const data = await adminModel.getOrderList({
    page,
    pageSize,
    pay_status: pay_status === '' ? undefined : pay_status,
    order_status: order_status === '' ? undefined : order_status,
    keyword,
  });
  res.json({ code: 0, data });
}

async function detail(req, res) {
  const data = await adminModel.getOrderDetail(req.params.id);
  if (!data) {
    return res.json({ code: 404, msg: '订单不存在' });
  }
  res.json({ code: 0, data });
}

async function updateStatus(req, res) {
  const { order_status } = req.body || {};
  if (!ORDER_STATUS.includes(Number(order_status))) {
    return res.json({ code: 400, msg: '非法的订单状态' });
  }
  const affected = await adminModel.updateOrderStatus(req.params.id, Number(order_status));
  if (!affected) {
    return res.json({ code: 404, msg: '订单不存在' });
  }
  res.json({ code: 0 });
}

/**
 * 修改取车/还车地址
 * v1.6.10：支持单独改一个或两个都改（与 updateStatus 同走 PUT /orders/:id/... 风格）
 */
async function updateAddress(req, res) {
  const { pickup_address, return_address } = req.body || {};
  const patch = {};
  // pp_order 两列均为 varchar(100)
  if (pickup_address !== undefined) {
    const v = String(pickup_address).trim();
    if (!v) return res.json({ code: 400, msg: '取车地址不能为空' });
    if (v.length > 100) return res.json({ code: 400, msg: '取车地址不能超过 100 个字符' });
    patch.pickup_address = v;
  }
  if (return_address !== undefined) {
    const v = String(return_address).trim();
    if (!v) return res.json({ code: 400, msg: '还车地址不能为空' });
    if (v.length > 100) return res.json({ code: 400, msg: '还车地址不能超过 100 个字符' });
    patch.return_address = v;
  }
  if (!Object.keys(patch).length) {
    return res.json({ code: 400, msg: '请提供要修改的地址' });
  }
  const affected = await adminModel.updateOrderAddress(req.params.id, patch);
  if (!affected) {
    return res.json({ code: 404, msg: '订单不存在或内容无变化' });
  }
  res.json({ code: 0, msg: '地址已更新' });
}

/**
 * 后台发起退款（v1.6.11）
 * 按需求：后台操作**不做任何订单状态校验**（前端自行判断），直接调微信退款；
 * 退款成功后 pay_status=2（已退款）、order_status=4（已取消）
 * body: { refund_desc?, refund_fee? }  // refund_fee 单位：元，缺省全额
 */
async function refund(req, res) {
  const { refund_desc, refund_fee } = req.body || {};
  const order = await adminModel.getOrderDetail(req.params.id);
  if (!order) {
    return res.json({ code: 404, msg: '订单不存在' });
  }
  try {
    const result = await refundService.refundOrder(order, { refundDesc: refund_desc, refundFee: refund_fee });
    console.log('[admin-refund] 退款成功:', order.order_sn, '金额', result.refundFee, '操作员', req.admin && req.admin.username);
    res.json({
      code: 0,
      msg: `退款成功，已退 ￥${result.refundFee}`,
      data: { refund_fee: result.refundFee, wx_refund_id: result.wxResult.refund_id },
    });
  } catch (error) {
    console.error('[admin-refund] 退款失败:', order.order_sn, error.message);
    res.json({ code: 500, msg: `退款失败：${error.message}` });
  }
}

async function stats(req, res) {
  const data = await adminModel.getDashboardStats();
  res.json({ code: 0, data });
}

module.exports = { list, detail, updateStatus, updateAddress, refund, stats };
