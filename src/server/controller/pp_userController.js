/**
 * 庞派小程序用户相关接口
 */



const weixin = require('../base/weixin-api.js')
const user = require('../model/user.js');




/**
 * 获取openid服务
 * @param {*} query 
 * @param {*} res 
 */
async function getOpenid(query, res) {
  if (query.code) {
    const result = await weixin.getWxOpenid(query.code)
    res.end(JSON.stringify({code:200,result}))
  }
}


/**
 * openid联合登陆，会自动注册
 * @param {*} query 
 * @param {*} res 
 */
async function openid_tryLogin(query, res) {
  if (query.openid) {
    const result = await user.registerUserByOpenid('pp', query.openid)
    res.end(JSON.stringify({code:200,msg:'自动登陆成功',result}))
  } else {
    res.end({code:201,msg:'登陆失败'})
  }
}



/**
 * 查询驾驶证信息接口
 * @param {*} params 
 */
async function getUserDriverInfo(query, res) {
  if (query.uid) {
    const result = await user.getUserDriverInfo(query.uid)
    console.log(result)
    res.end(JSON.stringify(result))
  }
}


/**
 * 更新用户驾驶证信息接口
 * @param {*} params 
 */
async function updateUserDriverInfo(query, res) {
  //获取query参数
  const driver_idcard_name = query.driver_idcard_name;
  const driver_idcard_number = query.driver_idcard_number;
  const driver_idcard_url = query.driver_idcard_url;
  const driver_idcard_birth = query.driver_idcard_birth;
  const uid = query.uid;

  const result = await user.updateUserDriverInfo(driver_idcard_name,driver_idcard_number,driver_idcard_url,driver_idcard_birth,uid)
  console.log(result)
  res.end(JSON.stringify(result))

}

/**
 * 导出模块
 */
module.exports = {
  getOpenid,
  openid_tryLogin,
  getUserDriverInfo,
  updateUserDriverInfo
}