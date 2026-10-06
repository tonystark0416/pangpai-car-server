/**
 * 管理后台：订单管理 + 概览统计
 */
const adminModel = require('../../models/admin.model');

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

async function stats(req, res) {
  const data = await adminModel.getDashboardStats();
  res.json({ code: 0, data });
}

module.exports = { list, detail, updateStatus, stats };
