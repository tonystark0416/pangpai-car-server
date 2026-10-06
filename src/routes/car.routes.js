/**
 * 车辆路由
 */
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const carController = require('../controllers/car.controller');

const router = express.Router();

// 车辆分页列表
router.get('/getCarList', asyncHandler(carController.getCarList));

module.exports = router;
