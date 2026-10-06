/**
 * 庞派汽车小程序结算接口，主要用途是用来计算价格
 * 一般在提交订单前在结算页面调用
 */
const car = require('../models/car.model');

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

  // 计价
  const rent_day_price = data.promotion_day_price; // 每日租金
  const rentDay = (returnTime - pickUpTime) / (1000 * 60 * 60 * 24); // 租车天数
  const rent_total_price = rent_day_price * rentDay; // 车辆租金
  const clean_price = 1; // 整备费用
  const server_day_price = insurancePrice; // 保险一日费用
  const server_total_price = server_day_price * rentDay; // 保险总费用
  const door_pickup_price = 0;
  const door_return_price = 0;
  const driver_total_price = driver_price * rentDay;
  const total_price =
    rent_total_price + clean_price + server_total_price + door_pickup_price + door_return_price + driver_total_price;

  const result = {
    uid: uid,
    contact_phone: contact_phone,
    data: data,
    rent_day_price,
    rentDay,
    rent_total_price,
    clean_price,
    server_day_price,
    server_total_price,
    door_pickup_price,
    door_return_price,
    driver_price,
    driver_total_price,
    total_price,
    pickUpAddress,
    returnAddress,
    pickUpTime,
    returnTime,
  };
  res.json(result);
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
