/**
 * 管理后台：车辆图片上传（multer）
 * v1.7.4：保存至 uploads/car_img 子目录，仅 jpg/png/webp，单张 ≤ 5MB
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

/** 单张上限 5MB（车辆展示图远小于此，留足余量） */
const MAX_SIZE = 5 * 1024 * 1024;
/** 上传目录：UPLOAD_DIR 下的图片子目录 */
const SUB_DIR = 'car_img';
const UPLOAD_DIR = path.join(config.upload.dir, SUB_DIR);
/** 允许的 MIME -> 扩展名映射（文件系统上统一由此决定后缀，不信任 originalname） */
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    // 时间戳 + 随机串，避免同名覆盖，也避免中文/空格等非法文件名
    const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const rand = crypto.randomBytes(4).toString('hex');
    cb(null, `car-${ts}-${rand}.${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const uploader = multer({
  storage,
  limits: { files: 1, fileSize: MAX_SIZE },
  fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error('仅支持 jpg / png / webp 格式的图片'));
    }
    cb(null, true);
  },
});

/**
 * 单图上传中间件：字段名 file
 * multer 的错误不走 Express 异常链，此处就地转成统一 JSON，避免被全局异常吞成 500
 */
function uploadCarImage(req, res, next) {
  uploader.single('file')(req, res, (err) => {
    if (!err) return next();
    let msg = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') msg = `图片大小不能超过 ${MAX_SIZE / 1024 / 1024}MB`;
    else if (err.code === 'LIMIT_FILE_COUNT') msg = '一次只能上传一张图片';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') msg = '上传字段名必须为 file';
    res.status(400).json({ code: 400, msg });
  });
}

module.exports = { uploadCarImage, MAX_SIZE, ALLOWED_TYPES, SUB_DIR };
