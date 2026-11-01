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

/**
 * 挑出「本次订单可用且抵扣最多」的一张券（v1.7.5）
 *
 * 用于**车辆详情页展示券后价**：只做挑选与试算，不锁定、不核销，
 * 真正用券仍以用户在结算页手选的 coupon_sn 为准（默认不选券的口径不变）。
 *
 * 可用性判定完全复用 `validateCoupon`（归属、状态、有效期、适用范围、金额门槛），
 * 与 `/checkout`、`/createOrder` 口径一致。
 *
 * 挑选规则：抵扣额最大（即面额最大，抵扣被 min(面额, 订单金额) 同额封顶）；
 * 面额相同时优先**最快过期**的那张，引导用户先消耗临期券。
 *
 * @param {object} p
 * @param {number|string} p.uid 不传/为空表示匿名（未登录），直接返回无券
 * @param {number|string} p.carId 车辆，用于适用范围校验
 * @param {number} p.orderAmount 本次订单原价（元），用于「订单金额 > 券面额」门槛
 * @returns {{coupon: {coupon_id, coupon_sn, amount}|null, name: string, use_end_time: *, count: number}}
 *          coupon 为 null 表示无可用券；count 为可用券总张数（前端可展示「你有 N 张可用券」）
 */
async function pickBestCoupon({ uid, carId, orderAmount }) {
  if (!uid) {
    return { coupon: null, name: '', use_end_time: null, count: 0 };
  }
  const list = await couponModel.getUserCoupons(uid, {
    carId,
    status: couponModel.USER_COUPON_STATUS.UNUSED,
    amount: orderAmount,
  });
  const usable = list.filter((c) => c.usable);
  if (!usable.length) {
    return { coupon: null, name: '', use_end_time: null, count: 0 };
  }
  usable.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return new Date(a.use_end_time).getTime() - new Date(b.use_end_time).getTime();
  });
  const best = usable[0];
  return {
    coupon: {
      coupon_id: best.coupon_id,
      coupon_sn: best.coupon_sn,
      amount: Number(best.amount),
    },
    name: best.name,
    use_end_time: best.use_end_time,
    count: usable.length,
  };
}

module.exports = { resolveCouponForOrder, pickBestCoupon };
