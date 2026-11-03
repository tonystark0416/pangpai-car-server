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
const pay = require('../../controllers/admin/pay.controller');
const upload = require('../../controllers/admin/upload.controller');
const { uploadCarImage } = require('../../middlewares/carUpload');

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

// 图片上传（v1.7.4：车辆图片 -> uploads/car_img）
router.post('/upload/car-image', uploadCarImage, asyncHandler(upload.uploadCarImage));

// 优惠券管理（v1.7.3）
router.get('/coupons', asyncHandler(coupon.list));
router.post('/coupons', asyncHandler(coupon.create));
router.get('/coupons/:id', asyncHandler(coupon.detail));
router.put('/coupons/:id', asyncHandler(coupon.update));
router.put('/coupons/:id/status', asyncHandler(coupon.updateStatus));
// 用户领券记录（v1.7.3）
router.get('/coupons/:id/records', asyncHandler(coupon.records));

// 订单管理
router.get('/orders', asyncHandler(order.list));
// 导出 Excel（须在 /orders/:id 之前注册，否则会被当作 id 匹配）
router.get('/orders/export', asyncHandler(order.exportOrders));
router.get('/orders/:id', asyncHandler(order.detail));
router.put('/orders/:id/status', asyncHandler(order.updateStatus));
router.put('/orders/:id/address', asyncHandler(order.updateAddress));
router.post('/orders/:id/refund', asyncHandler(order.refund));
// 核对微信支付状态（v1.7.10，只读对比本地与微信侧，发现手工退款等不一致）
router.get('/orders/:orderSn/check-wxpay', asyncHandler(order.checkWxPay));

// 支付流水（v1.7.9）：后台直接看支付/退款明细，不用登微信支付后台
// 导出须在 /pay-records/:id 之前注册，否则会被当作 id 匹配
router.get('/pay-records/export', asyncHandler(pay.exportRecords));
router.get('/pay-records', asyncHandler(pay.list));
router.get('/pay-records/:id', asyncHandler(pay.detail));
router.post('/pay-records/:id/sync', asyncHandler(pay.sync));
// 某订单的资金流水（订单详情内嵌）
router.get('/orders/:orderSn/pay-records', asyncHandler(pay.listByOrder));
// 每日对账（v1.7.11）：微信账单 vs 本地流水核对
router.get('/reconcile', asyncHandler(pay.reconcileList));
router.post('/reconcile/run', asyncHandler(pay.reconcileRun));

module.exports = router;
