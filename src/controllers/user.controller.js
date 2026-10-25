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
 * openid 登录（v1.7.0 起：**只查不注册**）
 *
 * 语义：本接口只回答「这个微信在本小程序有没有账号」
 *   有账号 → 200 + 用户行（含 id 即 uid）= **登录成功**
 *   没账号 → 202 + needRegister:true = **尚未注册**，需要走注册流程
 *
 * 注意 202 的含义是「没有账号」而不是「缺手机号」：手机号只是当前唯一的**注册手段**
 * （registerBy='phone'），未来若接入别的方式（如验证码）可平滑扩展。
 *
 * 旧行为（未绑定即自动建号）已废弃：openid 不再作为注册依据，账号以手机号为准。
 */
async function openid_tryLogin(req, res) {
  const { openid, unionid } = req.query;
  if (!openid) {
    return res.json({ code: 201, msg: '登陆失败' });
  }
  const result = await user.loginByOpenid(config.biz.code, openid, unionid);
  if (result) {
    return res.json({ code: 200, msg: '自动登陆成功', result });
  }
  return res.json({
    code: 202,
    msg: '该微信尚未注册账号，请先注册',
    needRegister: true, // 主语义：尚未注册（不是「缺手机号」）
    registerBy: 'phone', // 当前注册方式：微信手机号快速验证
    // v1.7.0 遗留字段，等价于 needRegister，保留以兼容已按旧文档接入的前端
    needPhone: true,
  });
}

/**
 * 手机号注册/登录（v1.7.0 新账号体系主入口）
 *
 * 入参：code（<button open-type="getPhoneNumber"> 回调的 code，非 wx.login 的 code）
 *       openid / unionid（可选，注册成功后一并绑定）
 * 出参：200 + result（用户行，含 id 即 uid）
 */
async function loginByPhone(req, res) {
  const { code, openid, unionid } = req.query;
  if (!code) {
    return res.json({ code: 201, msg: '缺少code参数' });
  }

  // 用手机号 code 向微信换真实手机号（access_token 接口，不需要 session_key）
  const wxRes = await weixin.getPhoneNumber(code);
  const phone = wxRes && wxRes.phone_info && wxRes.phone_info.purePhoneNumber;
  if (!phone) {
    // 常见：40001 access_token 失效、40029/41008 code 无效或已使用、41059 主体无权限
    console.error('[user] 微信手机号获取失败:', JSON.stringify(wxRes));
    return res.json({
      code: 400,
      msg: '手机号获取失败：' + ((wxRes && wxRes.errmsg) || '微信未返回手机号'),
      wxErrcode: wxRes && wxRes.errcode,
    });
  }

  const result = await user.loginOrRegisterByPhone(config.biz.code, phone, openid, unionid);
  if (result === -2) {
    return res.json({ code: 400, msg: '该微信已绑定其他账号，请联系客服' });
  }
  if (!result) {
    return res.json({ code: 500, msg: '注册失败，请重试' });
  }
  res.json({ code: 200, msg: '登陆成功', result });
}

/**
 * 已登录用户补填手机号（老用户无手机号时的补授权入口，可选接入）
 * 入参：uid（必填）+ code（手机号快速验证 code）
 */
async function bindPhone(req, res) {
  const { uid, code } = req.query;
  if (!uid || !code) {
    return res.json({ code: 201, msg: '缺少uid或code参数' });
  }

  const wxRes = await weixin.getPhoneNumber(code);
  const phone = wxRes && wxRes.phone_info && wxRes.phone_info.purePhoneNumber;
  if (!phone) {
    console.error('[user] 微信手机号获取失败:', JSON.stringify(wxRes));
    return res.json({
      code: 400,
      msg: '手机号获取失败：' + ((wxRes && wxRes.errmsg) || '微信未返回手机号'),
      wxErrcode: wxRes && wxRes.errcode,
    });
  }

  const ret = await user.updateUserPhone(uid, phone);
  if (ret === -1) return res.json({ code: 404, msg: '用户不存在' });
  if (ret === -2) return res.json({ code: 400, msg: '该手机号已被其他账号使用' });
  res.json({ code: 200, msg: '手机号绑定成功', phone });
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
  loginByPhone,
  bindPhone,
  getUserDriverInfo,
  updateUserDriverInfo,
};
