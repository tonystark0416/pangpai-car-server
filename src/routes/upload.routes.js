/**
 * 文件上传路由
 */
const express = require('express');
const upload = require('../middlewares/upload');
const uploadController = require('../controllers/upload.controller');

const router = express.Router();

// 单文件上传（字段名 file，上限 10MB）
router.post('/upload', upload.single('file'), uploadController.uploadFile);

module.exports = router;
