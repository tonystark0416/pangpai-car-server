/**
 * 汽车相关controller逻辑处理
 */
const car = require('../models/car.model');
const pricing = require('../services/pricing.service');
const couponService = require('../services/coupon.service');
const { formatDateTime } = require('../utils/time');
const carService = require('../services/car.service');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 车辆分页列表
 */
async function getCarList(req, res) {
  const { pageNum } = req.query;
  if (!pageNum) {
    return res.status(400).send('参数错误');
  }
  const data = await car.getCarList(pageNum);
  // v1.7.6：补上归一化后的 images / tags / config（列表也带，便于卡片展示标签）
  const list = Array.isArray(data) ? data.map(carService.decorateCar) : data;
  const result = { code: 0, list };
  res.json(result);
}

/**
 * 车辆详情（v1.7.5）
 *
 * @method GET ?carId=&uid=&pickUpTime=&returnTime=&insuranceLevel=&driver_price=
 * - `carId` 必填；`uid` **选填**——不传也能拿到车辆信息与参考价，传了才会算券后价
 * - 取还车时间选填：都不传时按**默认 1 天**算参考价（详情页通常还没选日期）
 * - 计价一律走 pricing.service（唯一真源），券后价 = total_price - discount_price
 *
 * 券后价口径：只展示「若使用最优可用券」的到手价，**不锁定、不自动核销**；
 * 真正用券仍由用户在结算页手选（沿用「默认不选券」的既有规则）。
 */
async function getCarInfo(req, res) {
  const {
    carId,
    uid,
    pickUpTime,
    returnTime,
    insuranceLevel,
    insurancePrice,
    driver_price,
  } = req.query;

  if (!carId) {
    return res.json({ code: 400, msg: '缺少参数：carId' });
  }

  const carInfo = await car.getCarInfo(carId);
  if (!carInfo) {
    return res.json({ code: 400, msg: '车辆不存在' });
  }
  // 与 /createOrder 口径一致：下架车辆不对外展示
  if (Number(carInfo.status) !== 1) {
    return res.json({ code: 400, msg: '该车辆已下架，暂不可预订' });
  }

  // ① 先按「不用券」算原价。未传取还车时间时以「当前时间起 1 天」作为参考租期
  const now = Date.now();
  const start = pickUpTime ? Number(pickUpTime) : now;
  const end = returnTime ? Number(returnTime) : start + DAY_MS;

  let price;
  try {
    price = await pricing.calcOrderPrice({
      carId,
      pickUpTime: start,
      returnTime: end,
      insuranceLevel,
      insurancePrice,
      driverPrice: driver_price,
    });
  } catch (error) {
    if (pricing.isPriceError(error)) {
      return res.json({ code: 400, msg: error.message });
    }
    throw error;
  }

  // ② 传了 uid 才查券：挑本次可用且抵扣最多的一张，用于展示券后价
  let bestCoupon = null;
  let couponCount = 0;
  if (uid) {
    const picked = await couponService.pickBestCoupon({
      uid,
      carId,
      orderAmount: price.total_price,
    });
    couponCount = picked.count;
    if (picked.coupon) {
      // ③ 带券重算，产出 discount_price / pay_amount（券后价）
      price = await pricing.calcOrderPrice({
        carId,
        pickUpTime: start,
        returnTime: end,
        insuranceLevel,
        insurancePrice,
        driverPrice: driver_price,
        coupon: picked.coupon,
      });
      bestCoupon = {
        coupon_sn: picked.coupon.coupon_sn,
        coupon_id: picked.coupon.coupon_id,
        name: picked.name,
        amount: picked.coupon.amount,
        use_end_time: formatDateTime(picked.use_end_time),
      };
    }
  }

  res.json({
    code: 200,
    // v1.7.6：车辆对象补上轮播图 images、标签 tags、配置 config
    data: carService.decorateCar(carInfo),
    ...price, // rentDay / total_price / discount_price / pay_amount / 各项费用明细
    best_coupon: bestCoupon, // 最优可用券（无券或匿名时为 null）
    coupon_count: couponCount, // 该车可用券张数（匿名时为 0）
    has_coupon: !!bestCoupon,
  });
}

module.exports = {
  getCarList,
  getCarInfo,
};
