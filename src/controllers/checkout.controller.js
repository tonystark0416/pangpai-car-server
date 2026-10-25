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
    insuranceLevel,
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
    price = await pricing.calcOrderPrice({ carId, pickUpTime, returnTime, insuranceLevel, insurancePrice, driverPrice: driver_price });
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
 * v1.6.18：**按车辆读取配置**（此前为全局固定的 1 / 120）
 * @method GET ?carId=（不传则返回系统默认值）
 */
async function getInsurancePrice(req, res) {
  const carInfo = req.query.carId ? await car.getCarInfo(req.query.carId) : null;
  if (req.query.carId && !carInfo) {
    return res.json({ code: 400, msg: '车辆不存在' });
  }
  res.json({
    code: 200,
    // 字段名沿用旧约定（保险必买，二选一）
    insurancePrice_l1: carInfo ? Number(carInfo.insurance_price_l1) : 100,
    insurancePrice_l2: carInfo ? Number(carInfo.insurance_price_l2) : 200,
  });
}

/**
 * 获取车辆费用配置（整备费 + 保险费，v1.6.18 新增）
 * @method GET ?carId=
 */
async function getCarFee(req, res) {
  const carInfo = await car.getCarInfo(req.query.carId);
  if (!carInfo) {
    return res.json({ code: 400, msg: '车辆不存在' });
  }
  res.json({
    code: 200,
    clean_price: Number(carInfo.clean_price || 0), // 按订单一次性收取，不乘天数
    insurancePrice_l1: Number(carInfo.insurance_price_l1), // 低档日单价
    insurancePrice_l2: Number(carInfo.insurance_price_l2), // 高档日单价
  });
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
  getCarFee,
  getDriverPrice,
};
