/**
 * 租车计价服务（v1.6.12 建立，v1.6.18 改为按车配置费用）
 *
 * 统一「租用天数 + 金额」的计算口径，供 `/checkout` 与 `/createOrder` 共用：
 *   - 天数：按 24 小时为 1 天**向上取整**，且至少 1 天（此前为小时比例的小数，会少收钱）
 *   - 金额：以服务端重算为准，**不信任前端传价**（此前直接采信前端，构造请求即可改价）
 *   - v1.6.18：**整备费与保险日单价改为每辆车单独配置**（此前整备费写死 1 元、保险是全局档位）
 *
 * 计价公式：
 *   总费用 = 车辆日租金 × 天数 + 保险日单价 × 天数 + 司机日单价 × 天数 + 整备费
 *   注：整备费为「按订单一次性」收取，**不乘天数**
 */
const car = require('../models/car.model');

const DAY_MS = 24 * 60 * 60 * 1000;
/** 司机服务白名单：不要 / 要（全局配置，与各车的司机需求无关） */
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
 * 确定保险档位与日单价（v1.6.18：**按车辆配置**）
 *
 * 规则：保险必买，二选一（低档 l1 / 高档 l2），缺省低档；金额一律取该车配置值。
 * 兼容旧的「传金额」调用：未传 insuranceLevel 时，按旧金额 1→l1、120/200→l2 推断档位，
 * 但**实际金额仍以车辆配置为准**，旧传值不再作为金额使用。
 *
 * @param {object} carInfo 车辆信息（含 insurance_price_l1/l2）
 * @param {string} [insuranceLevel] 'l1' | 'l2'
 * @param {number|string} [insurancePrice] 旧版入参（仅用于推断档位）
 * @returns {{level:'l1'|'l2', dayPrice:number}}
 */
function resolveInsurance(carInfo, insuranceLevel, insurancePrice) {
  const l1 = Number(carInfo.insurance_price_l1);
  const l2 = Number(carInfo.insurance_price_l2);
  if (!Number.isFinite(l1) || l1 < 0 || !Number.isFinite(l2) || l2 < 0) {
    throw new PriceError('车辆保险费用配置异常，请联系客服');
  }

  let level = 'l1'; // 缺省低档
  if (insuranceLevel === 'l2' || insuranceLevel === 'l1') {
    level = insuranceLevel;
  } else if (insurancePrice !== undefined && insurancePrice !== null && String(insurancePrice) !== '') {
    // 旧调用兼容：金额 120/200 视为高档，其余（1 或 0）视为低档
    const v = Number(insurancePrice);
    level = v >= 100 ? 'l2' : 'l1';
  }
  return { level, dayPrice: level === 'l2' ? l2 : l1 };
}

/**
 * 服务端重算订单价格（唯一计价入口）
 * v1.6.18：整备费与保险均改为**按车辆配置**取值
 * @param {object} p
 * @param {number|string} p.carId 车辆 ID
 * @param {string|number} p.pickUpTime 取车时间（毫秒时间戳）
 * @param {string|number} p.returnTime 还车时间（毫秒时间戳）
 * @param {string} [p.insuranceLevel] 保险档位：'l1' 低档 / 'l2' 高档，缺省 l1
 * @param {number|string} [p.insurancePrice] 旧版保险金额入参（仅用于推断档位，金额以车辆配置为准）
 * @param {number} [p.driverPrice] 司机日单价（白名单 0 / 400）
 * @returns {object} 与 /checkout 响应字段一致的计价结果
 */
async function calcOrderPrice({ carId, pickUpTime, returnTime, insuranceLevel, insurancePrice, driverPrice = 0 }) {
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

  // v1.6.18：整备费按车辆配置（按订单一次性收取，不乘天数）
  const clean_price = Number(carInfo.clean_price || 0);
  if (!Number.isFinite(clean_price) || clean_price < 0) {
    throw new PriceError('车辆整备费配置异常，请联系客服');
  }

  const insurance = resolveInsurance(carInfo, insuranceLevel, insurancePrice);
  const driver_day_price = pickOption(driverPrice, ALLOWED_DRIVER, '司机费用');

  const rent_total_price = round2(rent_day_price * rentDay);
  const server_day_price = insurance.dayPrice;
  const server_total_price = round2(server_day_price * rentDay);
  const driver_total_price = round2(driver_day_price * rentDay);
  const total_price = round2(
    rent_total_price + server_total_price + driver_total_price + clean_price
  );

  return {
    rent_day_price,
    rentDay,
    rent_total_price,
    clean_price,
    insurance_level: insurance.level,
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
  resolveInsurance,
  isPriceError,
  PriceError,
  ALLOWED_DRIVER,
  /** v1.6.18 之前的固定整备费，仅用于兼容说明；实际以 pp_car.clean_price 为准 */
  LEGACY_CLEAN_PRICE: 1,
};
