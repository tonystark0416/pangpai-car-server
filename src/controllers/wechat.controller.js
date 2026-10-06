/**
 * 微信服务能力控制器：小程序码、企业微信回调
 * （合并原 admin/wxServiceController.js 与 controller/workWeixinCallback.js）
 */
const miniprogram = require('../services/wechat/miniprogram');

/**
 * 生成不限量小程序码，以 image/png 返回
 * @method GET ?scene=&page=
 */
async function getUnlimitedQRCode(req, res) {
  const { scene, page } = req.query;
  const response = await miniprogram.getUnlimitedQRCode(scene, page);
  res.setHeader('Content-Type', 'image/png');
  res.end(response.data, 'binary');
}

/**
 * 企业微信回调 URL 验证（仅 echostr 验证，无业务处理）
 * https://developer.work.weixin.qq.com/document/path/90238
 * @method GET
 */
function verifyWorkCallback(req, res) {
  console.log(req.query);
  res.send('4444');
}

module.exports = {
  getUnlimitedQRCode,
  verifyWorkCallback,
};
