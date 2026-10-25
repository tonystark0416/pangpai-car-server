/**
 * 小程序端：优惠券路由（v1.7.3）
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const couponController = require('../controllers/coupon.controller');

const router = express.Router();

// 可领取的券列表（首页 banner）
router.get('/getCouponList', asyncHandler(couponController.getCouponList));

// 领取优惠券 → 返回唯一券码 coupon_sn
router.post('/receiveCoupon', asyncHandler(couponController.receiveCoupon));

// 我的券包（结算页按 carId 筛选出可用的券）
router.get('/getUserCoupons', asyncHandler(couponController.getUserCoupons));

module.exports = router;
