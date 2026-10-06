/**
 * 
 * 微信类，统一请求微信API服务的基础
 * 
 */
const wx_api_config = require('../../config/wx_api_config');    //小程序的参数文件
const axios = require('axios');
const fs = require('fs');

//获取配置里面的appid和secret
const appid = wx_api_config.appid
const secret = wx_api_config.secret


/**
 * 获取acess_token
 * @param {}  
 * @returns 
 */
async function getAccessToken() {
    const url = 'https://api.weixin.qq.com/cgi-bin/token?appid=' + appid + '&secret=' + secret + '&grant_type=client_credential';
    const res = await axios.get(url)
    return res.data.access_token
}


/**
 * 通过code获取openid
 * @param {string} js_code 
 * @returns 
 */
async function getWxOpenid(js_code) {
    const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + appid + '&secret=' + secret + '&js_code=' + js_code + '&grant_type=authorization_code';
    const res = await axios.get(url)
    return res.data
}


/**
 * 识别身份证
 * @param {string} img_url
 * @returns 
 */
async function getIdCardInfo(query, res) {
    console.log(query.img_url)
    const img_url = query.img_url
    const token = fs.readFileSync('/www/wwwroot/mikeapp/src/file/wx_access_token.txt', 'utf8')
    // console.log(token)
    const url = 'https://api.weixin.qq.com/cv/ocr/idcard?access_token=' + token+'&img_url='+img_url;
    const response = await axios.post(url, {img_url:img_url})
    console.log('Response:', response.jdata);
    res.end(JSON.stringify(response.data));


}



/**
 * 导出模块
 */
module.exports = {
    getWxOpenid,
    getAccessToken,
    getIdCardInfo
}