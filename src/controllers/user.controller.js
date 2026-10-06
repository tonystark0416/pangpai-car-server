/**
 * 庞派小程序用户相关接口
 */
const config = require('../config');
const weixin = require('../services/wechat/miniprogram');
const user = require('../models/user.model');

/**
 * 获取openid服务
 */
async function getOpenid(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.json({ code: 201, msg: '缺少code参数' });
  }
  const result = await weixin.getWxOpenid(code);
  res.json({ code: 200, result });
}

/**
 * openid联合登陆，会自动注册
 */
async function openid_tryLogin(req, res) {
  const { openid, unionid } = req.query;
  if (openid) {
    const result = await user.registerUserByOpenid(config.biz.code, openid, unionid);
    res.json({ code: 200, msg: '自动登陆成功', result });
  } else {
    res.json({ code: 201, msg: '登陆失败' });
  }
}

/**
 * 查询驾驶证信息接口
 */
async function getUserDriverInfo(req, res) {
  const { uid } = req.query;
  if (uid) {
    const result = await user.getUserDriverInfo(uid);
    res.json(result);
  } else {
    res.json({ code: 201, msg: '缺少uid参数' });
  }
}

/**
 * 更新用户驾驶证信息接口
 */
async function updateUserDriverInfo(req, res) {
  const {
    driver_idcard_name,
    driver_idcard_number,
    driver_idcard_url,
    driver_idcard_birth,
    uid,
  } = req.query;

  const result = await user.updateUserDriverInfo(
    driver_idcard_name,
    driver_idcard_number,
    driver_idcard_url,
    driver_idcard_birth,
    uid
  );
  res.json(result);
}

module.exports = {
  getOpenid,
  openid_tryLogin,
  getUserDriverInfo,
  updateUserDriverInfo,
};
