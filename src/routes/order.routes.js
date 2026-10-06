/**
 * 订单路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const orderController = require('../controllers/order.controller');

const router = express.Router();

// 创建订单
router.post('/createOrder', asyncHandler(orderController.createOrder));

// 分页查询订单列表
router.get('/getOrderList', asyncHandler(orderController.getOrderList));

// 查询订单详情
router.get('/getOrderDetail', asyncHandler(orderController.getOrderDetail));

module.exports = router;
