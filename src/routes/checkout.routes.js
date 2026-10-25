/**
 * 结算计价路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const checkoutController = require('../controllers/checkout.controller');

const router = express.Router();

// 结算计价
router.get('/checkout', asyncHandler(checkoutController.checkout));

// 保险报价（v1.6.18：传 carId 时按该车辆的配置返回）
router.get('/getInsurancePrice', asyncHandler(checkoutController.getInsurancePrice));
// 车辆费用配置：整备费 + 保险（v1.6.18 新增）
router.get('/getCarFee', asyncHandler(checkoutController.getCarFee));

// 司机服务报价
router.get('/getDriverPrice', asyncHandler(checkoutController.getDriverPrice));

module.exports = router;
