/**
 * 管理后台：文件上传控制器
 */
const config = require('../../config');
const { SUB_DIR } = require('../../middlewares/carUpload');

/**
 * 车辆图片上传：返回可直接写入 car.image_url 的访问地址
 * IMAGE_BASE_URL 未配置时返回相对路径 /images/car_img/xxx.jpg
 */
function uploadCarImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ code: 400, msg: '缺少 file 字段或文件为空' });
  }
  res.json({
    code: 0,
    data: {
      url: `${config.upload.baseUrl}/images/${SUB_DIR}/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
    },
  });
}

module.exports = { uploadCarImage };
