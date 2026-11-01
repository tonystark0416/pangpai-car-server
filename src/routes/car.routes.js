/**
 * 车辆路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const carController = require('../controllers/car.controller');

const router = express.Router();

// 车辆分页列表
router.get('/getCarList', asyncHandler(carController.getCarList));

// 车辆详情（v1.7.5：uid 选填，传了才算券后价）
router.get('/getCarInfo', asyncHandler(carController.getCarInfo));

module.exports = router;
