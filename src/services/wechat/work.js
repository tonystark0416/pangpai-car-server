/**
 * 企业微信服务端 API 封装
 */
const config = require('../../config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const corpid = config.workWx.corpid;
const corpsecret = config.workWx.corpsecret;

/**
 * 获取企业微信token
 * @returns 0,调用成功，返回token；-1,调用失败，返回企业微信失败错误码
 */
async function getWorkWeixinToken() {
  const url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + corpid + '&corpsecret=' + corpsecret;
  const res = await axios.get(url);
  if (res.data.errcode === 0) {
    return { code: 0, token: res.data.access_token };
  } else {
    return { code: -1, errcode: res.data.errcode };
  }
}

/**
 * 读取缓存的企业微信 access_token，文件不存在或超过 90 分钟未刷新时自动重取
 * （与 miniprogram.getAccessTokenCached 同一套兜底策略）
 * @returns {string} access_token
 */
const TOKEN_MAX_AGE_MS = 90 * 60 * 1000;

async function getWorkTokenCached() {
  const tokenPath = path.join(config.tokenDir, 'work_access_token.txt');
  try {
    const stat = fs.statSync(tokenPath);
    if (Date.now() - stat.mtimeMs > TOKEN_MAX_AGE_MS) {
      const err = new Error('企业微信 access_token 缓存已过期，重新获取');
      err.code = 'STALE';
      throw err;
    }
    return fs.readFileSync(tokenPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'STALE') throw err;
    const res = await getWorkWeixinToken();
    if (res.code !== 0 || !res.token) {
      throw new Error('企业微信 access_token 获取失败: ' + JSON.stringify(res));
    }
    fs.mkdirSync(config.tokenDir, { recursive: true });
    fs.writeFileSync(tokenPath, res.token);
    return res.token;
  }
}

/**
 * 获取企业成员信息接口
 * @param {*} userid
 * @returns
 */
async function getWorkUserInfo(userid) {
  const token = await getWorkTokenCached();
  const url = 'https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=' + token + '&userid=' + userid;
  const res = await axios.get(url);
  if (res.data.errcode === 0) {
    return res.data;
  } else {
    return { errcode: res.data.errcode };
  }
}

/**
 * 发送小程序消息接口（企业成员通知）
 * @param {*} touser
 * @param {*} appid
 * @param {*} page
 * @param {*} title
 * @param {*} description
 * @param {*} content_item key value数组 https://developer.work.weixin.qq.com/document/path/90236
 */
async function workSendMsgMiniProgram(touser, appid, page, title, description, content_item) {
  const data = { // 构建小程序发送对象
    touser: touser,
    msgtype: 'miniprogram_notice',
    miniprogram_notice: {
      appid: appid,
      page: page,
      title: title,
      description: description,
      content_item: content_item,
    },
  };
  const token = await getWorkTokenCached();
  const url = 'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token;
  const res = await axios.post(url, data);
  console.log(res.data);
}

/**
 * 导出模块
 */
module.exports = {
  getWorkWeixinToken,
  getWorkTokenCached,
  getWorkUserInfo,
  workSendMsgMiniProgram,
};
