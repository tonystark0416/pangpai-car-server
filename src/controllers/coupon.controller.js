/**
 * 小程序端：优惠券（v1.7.3）
 *
 * 三个入口：首页 banner 可领券列表 → 领券（生成唯一券码）→ 我的券包（结算页选券）
 * 结算时用券：/checkout 传 couponSn 试算优惠，/createOrder 传同一个 couponSn 正式核销。
 */
const coupon = require('../models/coupon.model');

const RECEIVE_ERR_TEXT = {
  '-1': '优惠券不存在或不在活动时间内',
  '-2': '优惠券已被领完',
  '-3': '已达每人限领张数',
  '-4': '领取失败，请稍后重试',
};

/**
 * 可领取的券列表（首页 banner 下方）
 * @method GET ?uid=
 */
async function getCouponList(req, res) {
  const { uid } = req.query;
  if (!uid) {
    return res.json({ code: 400, msg: '缺少参数：uid' });
  }
  const list = await coupon.listReceiveable(uid);
  res.json({
    code: 200,
    result: list,
    total: list.length,
  });
}

/**
 * 领取优惠券
 * @method POST body: { uid, couponId }
 */
async function receiveCoupon(req, res) {
  const { uid, couponId } = { ...req.query, ...(req.body || {}) };
  if (!uid || !couponId) {
    return res.json({ code: 400, msg: '缺少参数：uid 或 couponId' });
  }
  const result = await coupon.receiveCoupon(uid, couponId);
  if (typeof result === 'number') {
    return res.json({ code: 400, msg: RECEIVE_ERR_TEXT[String(result)] || '领取失败' });
  }
  res.json({ code: 200, msg: '领取成功', result });
}

/**
 * 我的券包 / **结算页可用券列表**
 * @method GET ?uid=&carId=&status=&amount=
 * carId：只返回该车辆可用的券
 * amount：**本次结算的订单原价**（元，取不带券调一次的 `/checkout` 返回的 `total_price`）。
 *   传了才会启用「订单金额必须大于券面额」的门槛校验，并把不可用的券标出原因；
 *   不传则该门槛不参与判断（券包页浏览场景）
 * @returns 每张券带 `usable`（是否可用）与 `unusable_reason`（不可选原因，可用时为空串）
 */
async function getUserCoupons(req, res) {
  const { uid, carId, status, amount } = req.query;
  if (!uid) {
    return res.json({ code: 400, msg: '缺少参数：uid' });
  }
  const list = await coupon.getUserCoupons(uid, { carId, status, amount });
  res.json({ code: 200, result: list, total: list.length });
}

module.exports = { getCouponList, receiveCoupon, getUserCoupons };
