/**
 * 管理后台路由：/admin-api
 */
const express = require('express');
const asyncHandler = require('../../middlewares/asyncHandler');
const adminAuth = require('../../middlewares/adminAuth');
const auth = require('../../controllers/admin/auth.controller');
const user = require('../../controllers/admin/user.controller');
const car = require('../../controllers/admin/car.controller');
const order = require('../../controllers/admin/order.controller');
const coupon = require('../../controllers/admin/coupon.controller');

const router = express.Router();

/* ---- 认证（公开） ---- */
router.post('/auth/login', asyncHandler(auth.login));

/* ---- 以下全部需要 JWT ---- */
router.use(adminAuth);

router.get('/auth/profile', asyncHandler(auth.profile));

// 概览统计
router.get('/dashboard/stats', asyncHandler(order.stats));

// 用户管理
router.get('/users', asyncHandler(user.list));
router.get('/users/:id', asyncHandler(user.detail));

// 车辆管理
router.get('/cars', asyncHandler(car.list));
router.post('/cars', asyncHandler(car.create));
router.put('/cars/:id', asyncHandler(car.update));
router.put('/cars/:id/status', asyncHandler(car.updateStatus));
router.delete('/cars/:id', asyncHandler(car.remove));

// 优惠券管理（v1.7.3）
router.get('/coupons', asyncHandler(coupon.list));
router.post('/coupons', asyncHandler(coupon.create));
router.get('/coupons/:id', asyncHandler(coupon.detail));
router.put('/coupons/:id', asyncHandler(coupon.update));
router.put('/coupons/:id/status', asyncHandler(coupon.updateStatus));

// 订单管理
router.get('/orders', asyncHandler(order.list));
// 导出 Excel（须在 /orders/:id 之前注册，否则会被当作 id 匹配）
router.get('/orders/export', asyncHandler(order.exportOrders));
router.get('/orders/:id', asyncHandler(order.detail));
router.put('/orders/:id/status', asyncHandler(order.updateStatus));
router.put('/orders/:id/address', asyncHandler(order.updateAddress));
router.post('/orders/:id/refund', asyncHandler(order.refund));

module.exports = router;
