/**
 * 结算计价路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const checkoutController = require('../controllers/checkout.controller');

const router = express.Router();

// 结算计价
router.get('/checkout', asyncHandler(checkoutController.checkout));

// 保险报价
router.get('/getInsurancePrice', asyncHandler(checkoutController.getInsurancePrice));

// 司机服务报价
router.get('/getDriverPrice', asyncHandler(checkoutController.getDriverPrice));

module.exports = router;
