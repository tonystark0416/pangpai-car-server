/**
 * 用户相关路由：登录、驾驶证信息
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const userController = require('../controllers/user.controller');
const miniprogram = require('../services/wechat/miniprogram');

const router = express.Router();

// code 换 openid
router.get('/getOpenid', asyncHandler(userController.getOpenid));

// openid 联合登录（自动注册）
router.get('/tryLogin', asyncHandler(userController.openid_tryLogin));

// 查询驾驶证信息
router.get('/getUserDriverInfo', asyncHandler(userController.getUserDriverInfo));

// 更新驾驶证信息
router.get('/updateUserDriverInfo', asyncHandler(userController.updateUserDriverInfo));

// 微信 OCR 身份证识别
router.get('/getIdCardInfo', asyncHandler(miniprogram.getIdCardInfo));

module.exports = router;
