/**
 * 企业微信接口基础文件
 */
const wx_api_config = require('../../config/wx_api_config');    //参数配置文件
const axios = require('axios'); 
const fs = require('fs');


//获取配置里面的appid和secret
const corpid = wx_api_config.corpid
const corpsecret = wx_api_config.corpsecret

/**
 * 获取企业微信token
 * 直接获取读取配置文件的数据
 * @param {}  
 * @returns 0,调用成功，返回token；-1,调用失败，返回企业微信失败错误码
 */
async function getWorkWeixinToken() {
    const url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + corpid + '&corpsecret=' + corpsecret;
    const res = await axios.get(url)
    if (res.data.errcode === 0) {
        console.log(res.data.access_token)
        return { code: 0, token: res.data.access_token }
    } else {
        return { code: -1, errcode: res.data.errcode }
    }
}

/**
 * 获取企业成员信息接口
 * @param {*} params 
 * @returns 
 */
async function getWorkUserInfo(userid) {
    const token = fs.readFileSync('/www/wwwroot/mikeapp/src/file/work_access_token.txt', 'utf8')
    const url = 'https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=' + token + '&userid=' + userid;
    const res = await axios.get(url)
    if (res.data.errcode === 0) {
        // console.log(JSON.stringify(res.data))
        return res.data
    } else {
        // console.log(res.data)
        return { errcode: res.data.errcode }
    }
}


//touser, appid, page, title, description, content_item
/**
 * 发送小程序消息接口
 * @param {*} touser 
 * @param {*} appid 
 * @param {*} page 
 * @param {*} title 
 * @param {*} description 
 * @param {*} content_item key value数组 https://developer.work.weixin.qq.com/document/path/90236
 */
async function workSendMsgMiniProgram(touser, appid, page, title, description, content_item) {
    const data = { //构建小程序发送对象
        touser: touser,
        msgtype: 'miniprogram_notice',
        miniprogram_notice: {
            appid: appid,
            page: page,
            title: title,
            description: description,
            content_item: content_item,

        }
    }
    const token = fs.readFileSync('/www/wwwroot/mikeapp/src/file/work_access_token.txt', 'utf8')
    const url = 'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token;
    const res = await axios.post(url, data)
    console.log(res.data)
}


// workSendMsgMiniProgram('LiuWeiZhao','wx020f943109e13f66','pages/orderList/orderList','订单通知','有一笔新订单',[{key:'订单号',value:999}])

/**
 * 导出模块
 */
module.exports = {
    getWorkWeixinToken,
    getWorkUserInfo,
    workSendMsgMiniProgram
}