/**
 * 请求微信接口
 */
const axios = require('axios');
const fs = require('fs');

/**
 * 获取小程序码
 * @param {string} scene 场景值，小程序启动时获取
 * @param {string} page 小程序路径，记得钱买呢不要填写/
 * @returns 
 */
async function getUnlimitedQRCode(scene,page) {
    const token = fs.readFileSync('/www/wwwroot/mikeapp/src/file/wx_access_token.txt', 'utf8')
    const url = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token='+token;
    const response = await axios.post(url,{scene:scene,page:page},{responseType: 'arraybuffer'})
    // console.log(response)
    return response;

}

/**
 * 导出模块
 */
module.exports = {
    getUnlimitedQRCode,
}