/**
 * 订单退款业务服务（v1.6.11）
 *
 * 统一管理「调用微信支付退款 + 更新订单状态」的流程，供管理后台与小程序 C 端共用，
 * 两端差异（是否校验订单状态）放在各自的控制器里，保证状态变更口径一致：
 *   退款成功 → pay_status=2（已退款）、order_status=4（已取消）
 */
const WechatPayV2 = require('./wechat/pay');
const config = require('../config');
const orderModel = require('../models/order.model');
const couponModel = require('../models/coupon.model');

const wechatPay = new WechatPayV2(config.wxPay);

/** 退款单号：R + 订单号（同一订单重复提交相同单号，便于幂等） */
function genRefundNo(orderSn) {
  return 'R' + orderSn;
}

/**
 * 执行退款
 * v1.7.3：退款金额口径由 total_price 改为 **pay_amount（实付）**
 *   - 微信退款接口的 total_fee 必须是**原支付金额**，用券后若不改会导致退款失败
 *   - 退款成功后，订单使用的优惠券退回用户账户（有效期已过则不退回）
 * @param {object} order 订单对象（至少含 order_sn、pay_amount/total_price、uid）
 * @param {object} [options]
 * @param {number} [options.refundFee] 退款金额（元），缺省为全额实付
 * @param {string} [options.refundDesc] 退款原因
 * @returns {object} { refundFee, wxResult, couponReturned }
 */
async function refundOrder(order, options = {}) {
  if (!order || !order.order_sn) {
    throw new Error('订单不存在');
  }
  if (order.pay_status !== undefined && Number(order.pay_status) !== 1) {
    // 未支付/已退款的订单调用会在微信侧报「订单不可退款」，此处提前给出可读错误
    throw new Error(`订单当前支付状态不允许退款（pay_status=${order.pay_status}，需为 1 已支付）`);
  }

  // v1.7.3：以实付金额为准（历史订单 pay_amount 已回填为 total_price）
  const paidAmount = Number(order.pay_amount ?? order.total_price);
  const totalFee = Math.round(paidAmount * 100); // 元 → 分（微信侧要求为原支付金额）
  const refundFee = options.refundFee
    ? Math.round(Number(options.refundFee) * 100)
    : totalFee;

  if (!refundFee || refundFee <= 0 || refundFee > totalFee) {
    throw new Error(`退款金额不合法：￥${options.refundFee || paidAmount}（订单实付 ￥${paidAmount}）`);
  }

  const wxResult = await wechatPay.refund({
    outTradeNo: order.order_sn,
    outRefundNo: genRefundNo(order.order_sn),
    totalFee,
    refundFee,
    refundDesc: options.refundDesc || '订单退款',
  });

  // 微信退款成功后再落库（失败抛错由上层处理，不污染订单状态）
  const affected = await orderModel.markOrderRefunded(order.order_sn);
  if (affected === -1) {
    throw new Error('退款已在微信侧成功，但订单状态更新失败，请人工核对订单号 ' + order.order_sn);
  }

  // v1.7.3：退款成功后把券退回账户（券有效期已过则不退回，避免留下用不了的脏券）
  let couponReturned = 'none';
  if (order.coupon_sn) {
    couponReturned = await couponModel.returnCouponByOrder(order.order_sn);
  }

  return { refundFee: refundFee / 100, wxResult, couponReturned };
}

module.exports = { refundOrder, genRefundNo };
