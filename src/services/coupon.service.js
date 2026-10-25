/**
 * 优惠券校验服务（v1.7.3）
 *
 * 供 `/checkout`（试算）与 `/createOrder`（正式核销）共用，保证两处口径一致：
 * 券必须存在、归属本人、未使用未作废、在使用时间窗口内、适用于当前车辆。
 *
 * 每单最多使用一张券（本服务只接受单个 couponSn）。
 */
const couponModel = require('../models/coupon.model');

/**
 * 校验并取出一张可在本次订单使用的券
 * @param {object} p
 * @param {number|string} p.uid 下单用户（防止用他人券码）
 * @param {string} [p.couponSn] 券码，不传表示不用券
 * @param {number|string} p.carId 用于校验适用范围
 * @param {number} [p.orderAmount] 本次订单原价（元）。给定时要求 **orderAmount > 券面额**，
 *        否则判定为不可用——避免产生 0 元订单
 * @returns {{ok:boolean, msg?:string, coupon?:{coupon_id,coupon_sn,amount}}}
 */
async function resolveCouponForOrder({ uid, couponSn, carId, orderAmount }) {
  if (!couponSn) {
    return { ok: true, coupon: null }; // 不传券码 = 本次不使用优惠券（默认行为）
  }
  const row = await couponModel.getUserCouponBySn(couponSn, uid);
  const check = couponModel.validateCoupon(row, { carId, orderAmount });
  if (!check.ok) {
    return { ok: false, msg: check.msg };
  }
  return {
    ok: true,
    coupon: {
      coupon_id: check.coupon.coupon_id,
      coupon_sn: check.coupon.coupon_sn,
      amount: Number(check.coupon.amount),
    },
  };
}

module.exports = { resolveCouponForOrder };
