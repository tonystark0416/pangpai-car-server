/**
 * 文件上传控制器
 * 实际接收由 middlewares/upload.js（multer）完成
 */
const config = require('../config');

/**
 * 单文件上传（字段名 file，上限 10MB）
 * 返回 { code:200, path: 图片访问URL }
 */
function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: '缺少file字段或文件为空' });
  }
  const fileUrl = config.upload.baseUrl + '/images/' + req.file.filename;
  res.json({ code: 200, path: fileUrl });
}

module.exports = {
  uploadFile,
};
