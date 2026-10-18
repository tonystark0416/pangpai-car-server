/**
 * 租车计价服务（v1.6.12）
 *
 * 统一「租用天数 + 金额」的计算口径，供 `/checkout` 与 `/createOrder` 共用：
 *   - 天数：按 24 小时为 1 天**向上取整**，且至少 1 天（此前为小时比例的小数，会少收钱）
 *   - 金额：以服务端重算为准，**不信任前端传价**（此前直接采信前端，构造请求即可改价）
 *   - 保险/司机：按白名单枚举校验（此前前端传任意值都接受）
 */
const car = require('../models/car.model');

const DAY_MS = 24 * 60 * 60 * 1000;
/** 整备费（固定） */
const CLEAN_PRICE = 1;
/** 保险档位白名单：不买 / l1 / l2（与 getInsurancePrice 输出一致） */
const ALLOWED_INSURANCE = [0, 1, 120];
/** 司机服务白名单：不要 / 要（与 getDriverPrice 输出一致） */
const ALLOWED_DRIVER = [0, 400];

class PriceError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'PriceError';
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 判断是否为计价类错误（区分车辆不存在等业务错误） */
function isPriceError(err) {
  return err instanceof PriceError;
}

/**
 * 计算租用天数：24 小时为 1 天向上取整，至少 1 天
 * @param {string|number} pickUpTime 取车时间（毫秒时间戳）
 * @param {string|number} returnTime 还车时间（毫秒时间戳）
 * @returns {number} 天数（整数 ≥1）
 */
function calcRentDays(pickUpTime, returnTime) {
  const start = Number(pickUpTime);
  const end = Number(returnTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
    throw new PriceError('取车/还车时间不合法');
  }
  if (end <= start) {
    throw new PriceError('还车时间必须晚于取车时间');
  }
  // 向上取整后兜底至少 1 天（不足 24 小时按 1 天计）
  return Math.max(1, Math.ceil((end - start) / DAY_MS));
}

/** 校验可选服务金额是否在白名单内 */
function pickOption(value, allowed, name) {
  const v = Number(value || 0);
  if (!allowed.includes(v)) {
    throw new PriceError(`${name}不合法，可选值：${allowed.join(' / ')}`);
  }
  return v;
}

/**
 * 服务端重算订单价格（唯一计价入口）
 * @param {object} p
 * @param {number|string} p.carId 车辆 ID
 * @param {string|number} p.pickUpTime 取车时间（毫秒时间戳）
 * @param {string|number} p.returnTime 还车时间（毫秒时间戳）
 * @param {number} [p.insurancePrice] 保险日单价（白名单校验）
 * @param {number} [p.driverPrice] 司机日单价（白名单校验）
 * @returns {object} 与 /checkout 响应字段一致的计价结果
 */
async function calcOrderPrice({ carId, pickUpTime, returnTime, insurancePrice = 0, driverPrice = 0 }) {
  const carInfo = await car.getCarInfo(carId);
  if (!carInfo) {
    throw new PriceError('车辆不存在，无法计价');
  }

  const rentDay = calcRentDays(pickUpTime, returnTime);
  // 促销价优先，缺失时回退日常价（避免 promotion_day_price 为空导致租金为 null）
  const rent_day_price = Number(carInfo.promotion_day_price || carInfo.day_price);
  if (!Number.isFinite(rent_day_price) || rent_day_price < 0) {
    throw new PriceError('车辆日租金异常，请联系客服');
  }

  const server_day_price = pickOption(insurancePrice, ALLOWED_INSURANCE, '保险金额');
  const driver_day_price = pickOption(driverPrice, ALLOWED_DRIVER, '司机费用');

  const rent_total_price = round2(rent_day_price * rentDay);
  const server_total_price = round2(server_day_price * rentDay);
  const driver_total_price = round2(driver_day_price * rentDay);
  const total_price = round2(
    rent_total_price + CLEAN_PRICE + server_total_price + driver_total_price
  );

  return {
    rent_day_price,
    rentDay,
    rent_total_price,
    clean_price: CLEAN_PRICE,
    server_day_price,
    server_total_price,
    door_pickup_price: 0,
    door_return_price: 0,
    driver_price: driver_day_price,
    driver_total_price,
    total_price,
    pickUpTime: String(pickUpTime),
    returnTime: String(returnTime),
  };
}

module.exports = {
  calcOrderPrice,
  calcRentDays,
  isPriceError,
  PriceError,
  CLEAN_PRICE,
  ALLOWED_INSURANCE,
  ALLOWED_DRIVER,
};
