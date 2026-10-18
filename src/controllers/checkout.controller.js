/**
 * 庞派汽车小程序结算接口，主要用途是用来计算价格
 * 一般在提交订单前在结算页面调用
 */
const car = require('../models/car.model');
const pricing = require('../services/pricing.service');

/**
 * 结算计价
 */
async function checkout(req, res) {
  const {
    uid,
    contact_phone,
    carId,
    pickUpTime,
    pickUpAddress,
    returnTime,
    returnAddress,
    insurancePrice,
    driver_price,
  } = req.query;

  if (!uid || !carId) {
    return res.json({ code: -1, msg: '参数缺失' });
  }

  const data = await car.getCarInfo(carId);
  if (!data) {
    return res.json({ code: 400, msg: '车辆不存在，无法结算' });
  }

  // v1.6.12：统一走计价服务——天数按 24h 向上取整且至少 1 天，金额由服务端计算
  let price;
  try {
    price = await pricing.calcOrderPrice({ carId, pickUpTime, returnTime, insurancePrice, driverPrice: driver_price });
  } catch (error) {
    if (pricing.isPriceError(error)) {
      return res.json({ code: 400, msg: error.message });
    }
    throw error;
  }

  // 响应结构与前端旧约定保持一致（可直接作为 createOrder 的 checkOutArray）
  res.json({
    uid: uid,
    contact_phone: contact_phone,
    data: data,
    ...price,
    pickUpAddress,
    returnAddress,
  });
}

/**
 * 获取保险价格
 */
function getInsurancePrice(req, res) {
  const result = {
    code: 200,
    insurancePrice_l1: 1,
    insurancePrice_l2: 120,
  };
  res.json(result);
}

/**
 * 获取司机价格
 */
function getDriverPrice(req, res) {
  const result = {
    code: 200,
    driver_price: 400,
  };
  res.json(result);
}

module.exports = {
  checkout,
  getInsurancePrice,
  getDriverPrice,
};
