/**
 * 支付路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

// JSAPI（小程序）统一下单
router.get('/getWxPay', asyncHandler(paymentController.createJsapiPayment));

// 微信支付异步回调（XML）
router.post('/wxPayCallback', paymentController.handlePaymentNotify);

// 微信支付查单（管理端）
router.get('/queryWxPayOrder', asyncHandler(paymentController.queryOrder));

// 申请退款（管理端）
router.post('/applyRefund', asyncHandler(paymentController.applyRefund));

module.exports = router;
