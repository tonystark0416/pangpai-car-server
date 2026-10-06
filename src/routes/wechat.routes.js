/**
 * 微信服务能力路由：小程序码、企业微信回调
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const wechatController = require('../controllers/wechat.controller');

const router = express.Router();

// 企业微信回调 URL 验证
router.get('/workWeixinCallback', wechatController.verifyWorkCallback);

// 生成不限量小程序码
router.get('/getQrCode', asyncHandler(wechatController.getUnlimitedQRCode));

module.exports = router;
