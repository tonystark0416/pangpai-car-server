/**
 * 文件上传中间件（multer 实例）
 * 单文件、字段名 file、上限 10MB，保存至 UPLOAD_DIR
 */
const multer = require('multer');
const fs = require('fs');
const config = require('../config');

// 确保上传目录存在
fs.mkdirSync(config.upload.dir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, config.upload.dir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + '.' + file.originalname.split('.').pop());
  },
});

module.exports = multer({ storage: storage, limits: { files: 1, fileSize: 10000000 } });
