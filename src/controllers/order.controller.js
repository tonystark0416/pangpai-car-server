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
async function getOrderList(req, res) {
  const { uid, pageNumber } = req.query;
  const result = await order.getOrderList(uid, pageNumber);
  if (result && result[0]) {
    res.json({ code: 200, result });
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

module.exports = {
  createOrder,
  getOrderList,
  getOrderDetail,
};
