/**
 * 管理后台：订单管理 + 概览统计
 */
const adminModel = require('../../models/admin.model');
const refundService = require('../../services/refund.service');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');

// 履约状态合法值
const ORDER_STATUS = [0, 1, 2, 3, 4];

// 导出 Excel 用的中文文案（对应 pay_status / order_status）
const PAY_STATUS_TEXT = { 0: '未支付', 1: '已支付', 2: '已退款' };
const ORDER_STATUS_TEXT = { 0: '待取车', 1: '已取车', 2: '已还车', 3: '已完成', 4: '已取消' };

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

/**
 * 导出订单 Excel（v1.6.13）
 * GET /orders/export?pay_status=&order_status=&keyword=&scope=
 * scope=all 时忽略筛选条件导出全部（≤20000 条），否则按当前筛选条件导出
 * 说明：导出条件与列表同源（admin.model.buildOrderWhere），保证口径一致
 */
async function exportOrders(req, res) {
  const { pay_status, order_status, keyword, scope } = req.query;
  const useAll = scope === 'all';
  const rows = await adminModel.getOrderExportList({
    pay_status: useAll ? undefined : pay_status,
    order_status: useAll ? undefined : order_status,
    keyword: useAll ? '' : keyword || '',
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = '庞派汽车管理后台';
  wb.created = new Date();
  const ws = wb.addWorksheet('订单');

  ws.columns = [
    { header: '订单号', key: 'order_sn', width: 22 },
    { header: '用户ID', key: 'uid', width: 10 },
    { header: '联系电话', key: 'contact_phone', width: 14 },
    { header: '车辆', key: 'car_name', width: 20 },
    { header: '租车天数', key: 'rent_day', width: 10 },
    { header: '日租金单价', key: 'rent_day_price', width: 12 },
    { header: '车辆租金合计', key: 'rent_total_price', width: 14 },
    { header: '整备费', key: 'clean_price', width: 10 },
    { header: '保险费单价', key: 'server_day_price', width: 12 },
    { header: '保险费合计', key: 'server_total_price', width: 12 },
    { header: '司机单价', key: 'driver_price', width: 12 },
    { header: '司机合计', key: 'driver_total_price', width: 12 },
    { header: '订单总额(原价)', key: 'total_price', width: 14 },
    { header: '优惠金额', key: 'discount_price', width: 12 },
    { header: '实付金额', key: 'pay_amount', width: 12 },
    { header: '优惠券名称', key: 'coupon_name', width: 20 },
    { header: '优惠券码', key: 'coupon_sn', width: 26 },
    { header: '支付状态', key: 'pay_status_text', width: 10 },
    { header: '履约状态', key: 'order_status_text', width: 12 },
    { header: '微信支付单号', key: 'transaction_id', width: 28 },
    { header: '支付时间', key: 'pay_time_text', width: 20 },
    { header: '取车时间', key: 'pickup_time_text', width: 20 },
    { header: '还车时间', key: 'return_time_text', width: 20 },
    { header: '取车地址', key: 'pickup_address', width: 28 },
    { header: '还车地址', key: 'return_address', width: 28 },
    { header: '创建时间', key: 'create_time_text', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }]; // 冻结表头

  const fmtTime = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '');
  rows.forEach((r) => {
    ws.addRow({
      order_sn: r.order_sn,
      uid: r.uid,
      contact_phone: r.contact_phone,
      car_name: r.car_name || '',
      rent_day: Number(r.rent_day),
      rent_day_price: Number(r.rent_day_price),
      rent_total_price: Number(r.rent_total_price),
      clean_price: Number(r.clean_price || 0), // v1.6.18：整备费已落库（历史订单迁移时回填为当时的 1 元）
      server_day_price: Number(r.server_day_price || 0),
      server_total_price: Number(r.server_total_price || 0),
      driver_price: Number(r.driver_price || 0),
      driver_total_price: Number(r.driver_total_price || 0),
      total_price: Number(r.total_price),
      // v1.7.3：优惠券金额与实付（无券订单两者一致）
      discount_price: Number(r.discount_price || 0),
      pay_amount: Number(r.pay_amount ?? r.total_price),
      coupon_sn: r.coupon_sn || '-',
      coupon_name: r.coupon_name || '-', // v1.7.3：券名（无券为 -）
      pay_status_text: PAY_STATUS_TEXT[r.pay_status] ?? String(r.pay_status),
      order_status_text: ORDER_STATUS_TEXT[r.order_status] ?? String(r.order_status),
      transaction_id: r.transaction_id || '-',
      pay_time_text: r.pay_time ? fmtTime(r.pay_time) : '-',
      // 取还时间为毫秒时间戳字符串
      pickup_time_text: fmtTime(Number(r.pickup_time) || r.pickup_time),
      return_time_text: fmtTime(Number(r.return_time) || r.return_time),
      pickup_address: r.pickup_address || '',
      return_address: r.return_address || '',
      create_time_text: fmtTime(r.create_time),
    });
  });

  const filename = `订单导出_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await wb.xlsx.write(res);
  res.end();
}

async function stats(req, res) {
  // v1.6.13：概览页同时返回今日数据与近 7 日趋势
  const [data, recent7Days] = await Promise.all([
    adminModel.getDashboardStats(),
    adminModel.getRecentOrderStats(7),
  ]);
  res.json({ code: 0, data: { ...data, recent7Days } });
}

module.exports = { list, detail, updateStatus, updateAddress, refund, exportOrders, stats };
