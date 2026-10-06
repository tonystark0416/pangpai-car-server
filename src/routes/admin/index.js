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
router.delete('/cars/:id', asyncHandler(car.remove));

// 订单管理
router.get('/orders', asyncHandler(order.list));
router.get('/orders/:id', asyncHandler(order.detail));
router.put('/orders/:id/status', asyncHandler(order.updateStatus));

module.exports = router;
