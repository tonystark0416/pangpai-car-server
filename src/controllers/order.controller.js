/**
 * 订单控制器
 */
const order = require('../models/order.model');
const pricing = require('../services/pricing.service');

/**
 * 创建订单接口
 * v1.6.12：服务器端重新计价——天数/金额以服务端为准，前端传价仅作为选项（保险、司机）输入
 * @method POST body: { checkOutArray: {...结算结果} }
 */
async function createOrder(req, res) {
  const data = req.body;
  if (!data || !data.checkOutArray || !data.checkOutArray.uid) {
    return res.status(400).json({ code: 400, msg: '参数缺失：缺少 checkOutArray 或 uid' });
  }

  const c = data.checkOutArray;
  let price;
  try {
    price = await pricing.calcOrderPrice({
      carId: c.data && c.data.id,
      pickUpTime: c.pickUpTime,
      returnTime: c.returnTime,
      insurancePrice: c.server_day_price,
      driverPrice: c.driver_price,
    });
  } catch (error) {
    if (pricing.isPriceError(error)) {
      return res.status(400).json({ code: 400, msg: error.message });
    }
    throw error;
  }

  const result = await order.createOrder(data, price);
  // v1.6.8：车辆不存在/已下架时拒绝下单（模型层返回约定见 order.model.createOrder）
  if (result === -2) {
    return res.status(400).json({ code: 400, msg: '车辆不存在，无法下单' });
  }
  if (result === -3) {
    return res.status(400).json({ code: 400, msg: '该车辆已下架，暂不可预订' });
  }
  if (!result) {
    return res.status(500).json({ code: 500, msg: '订单创建失败' });
  }
  res.json({ message: '数据接收成功', result });
}

/**
 * 分页查询订单列表接口
 * @method GET ?uid=&pageNumber=
 */
/**
 * 分页查询订单列表接口
 * v1.6.17：新增可选筛选 pay_status / order_status（支持逗号分隔多值，非法值忽略）
 * @method GET ?uid=&pageNumber=&pay_status=&order_status=
 */
async function getOrderList(req, res) {
  const { uid, pageNumber, pay_status, order_status } = req.query;
  const result = await order.getOrderList(uid, pageNumber, { pay_status, order_status });
  // result 为 -1（页码为 0）或空列表时都按「无订单数据」返回，保持与旧版一致
  if (result && result.list && result.list.length) {
    res.json({
      code: 200,
      result: result.list,
      // v1.6.17 新增（可选字段，不影响老版本只取 result 的写法）
      total: result.total,
      page: Number(pageNumber) || 1,
      pageSize: 10,
    });
  } else {
    res.json({ code: 201, msg: '无订单数据' });
  }
}

/**
 * 查询订单详情接口
 * @method GET ?orderSn=&uid=
 */
async function getOrderDetail(req, res) {
  const { orderSn, uid } = req.query;
  const result = await order.getOrderDetail(orderSn, uid);
  if (result) {
    res.json({ code: 200, result });
  } else {
    res.json({ code: 201, msg: '无订单数据' });
  }
}

/**
 * 取消订单（v1.6.16，仅用于**未支付**订单，不涉及资金）
 *
 * 与 POST /cancelRefund 的分工：
 *   - 未支付 → 本接口，只把订单置为「已取消」
 *   - 已支付 → /cancelRefund，走微信退款并置「已退款 + 已取消」
 *
 * @method POST body/query: { orderSn, uid }
 */
async function cancelOrder(req, res) {
  const { orderSn, uid } = { ...req.query, ...(req.body || {}) };
  if (!orderSn || !uid) {
    return res.json({ code: 400, msg: '缺少参数：orderSn 或 uid' });
  }

  const orderInfo = await order.getOrderBySn(orderSn);
  if (!orderInfo) {
    return res.json({ code: 404, msg: '订单不存在' });
  }
  if (Number(orderInfo.uid) !== Number(uid)) {
    return res.json({ code: 403, msg: '无权操作该订单' });
  }

  // 已支付订单必须走退款出口，避免「钱没退、单却取消了」
  if (Number(orderInfo.pay_status) !== 0) {
    const msg =
      Number(orderInfo.pay_status) === 1
        ? '订单已支付，请走退款流程 /cancelRefund'
        : '订单已退款，无需取消';
    return res.json({ code: 400, msg });
  }
  if (Number(orderInfo.order_status) === 4) {
    return res.json({ code: 400, msg: '订单已取消' });
  }
  if (Number(orderInfo.order_status) !== 0) {
    return res.json({ code: 400, msg: '订单已取车，无法取消，请联系客服' });
  }

  const affected = await order.cancelUnpaidOrder(orderSn, uid);
  if (affected === 1) {
    console.log('[order] 用户取消未支付订单成功:', orderSn);
    return res.json({ code: 200, msg: '订单已取消', result: { order_sn: orderSn, order_status: 4 } });
  }
  if (affected === 0) {
    return res.json({ code: 400, msg: '订单状态已变化，请刷新后重试' });
  }
  return res.json({ code: 500, msg: '取消订单失败，请稍后重试' });
}

module.exports = {
  createOrder,
  getOrderList,
  getOrderDetail,
  cancelOrder,
};
