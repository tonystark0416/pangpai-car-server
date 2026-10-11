/**
 * 微信小程序服务端 API 封装
 * 合并原 weixin-api.js 与 weixin.api.js
 */
const config = require('../../config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const appid = config.wx.appid;
const secret = config.wx.secret;

/**
 * 获取小程序 access_token
 * @returns access_token
 */
async function getAccessToken() {
  const url = 'https://api.weixin.qq.com/cgi-bin/token?appid=' + appid + '&secret=' + secret + '&grant_type=client_credential';
  const res = await axios.get(url);
  if (!res.data.access_token) {
    throw new Error('微信 access_token 获取失败: ' + JSON.stringify(res.data));
  }
  return res.data.access_token;
}

/**
 * 读取缓存的 access_token，文件不存在时自动获取并落盘
 * （主服务与 token 刷新任务为两个进程，新环境/本地未跑任务时缓存文件缺失，
 *   直接 readFileSync 会抛 ENOENT 导致全局异常，此处兜底）
 * @returns {string} access_token
 */
async function getAccessTokenCached() {
  const tokenPath = path.join(config.tokenDir, 'wx_access_token.txt');
  try {
    return fs.readFileSync(tokenPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const token = await getAccessToken();
    fs.mkdirSync(config.tokenDir, { recursive: true });
    fs.writeFileSync(tokenPath, token);
    return token;
  }
}

/**
 * 通过 code 获取 openid
 * @param {string} js_code
 * @returns {openid, session_key, ...}
 */
async function getWxOpenid(js_code) {
  const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + appid + '&secret=' + secret + '&js_code=' + js_code + '&grant_type=authorization_code';
  const res = await axios.get(url);
  return res.data;
}

/**
 * 识别身份证（微信 OCR）
 * @method GET ?img_url=
 */
async function getIdCardInfo(req, res) {
  const { img_url } = req.query;
  const token = await getAccessTokenCached();
  const url = 'https://api.weixin.qq.com/cv/ocr/idcard?access_token=' + token + '&img_url=' + img_url;
  const response = await axios.post(url, { img_url: img_url });
  res.json(response.data);
}

/**
 * 获取不限量小程序码
 * @param {string} scene 场景值，小程序启动时获取
 * @param {string} page 小程序路径，注意前面不要填写 /
 * @returns axios response（arraybuffer）
 */
async function getUnlimitedQRCode(scene, page) {
  const token = await getAccessTokenCached();
  const url = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=' + token;
  const response = await axios.post(url, { scene: scene, page: page }, { responseType: 'arraybuffer' });
  return response;
}

/**
 * 导出模块
 */
module.exports = {
  getAccessToken,
  getAccessTokenCached,
  getWxOpenid,
  getIdCardInfo,
  getUnlimitedQRCode,
};
