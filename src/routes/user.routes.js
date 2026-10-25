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

// openid 登录（v1.7.0 起只查不注册，未绑定返回 202 引导手机号授权）
router.get('/tryLogin', asyncHandler(userController.openid_tryLogin));

// 手机号注册/登录（微信手机号快速验证 code 换号后注册，并绑定 openid/unionid）
router.get('/loginByPhone', asyncHandler(userController.loginByPhone));

// 已登录用户补填手机号（老用户无手机号时的补授权入口）
router.get('/bindPhone', asyncHandler(userController.bindPhone));

// 查询驾驶证信息
router.get('/getUserDriverInfo', asyncHandler(userController.getUserDriverInfo));

// 更新驾驶证信息
router.get('/updateUserDriverInfo', asyncHandler(userController.updateUserDriverInfo));

// 微信 OCR 身份证识别
router.get('/getIdCardInfo', asyncHandler(miniprogram.getIdCardInfo));

module.exports = router;
