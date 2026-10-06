/**
 * 路由汇总
 */
const express = require('express');

const router = express.Router();

router.use(require('./user.routes'));

// 管理后台 API（JWT 鉴权）
router.use('/admin-api', require('./admin'));
router.use(require('./car.routes'));
router.use(require('./checkout.routes'));
router.use(require('./order.routes'));
router.use(require('./payment.routes'));
router.use(require('./wechat.routes'));
router.use(require('./upload.routes'));

module.exports = router;
