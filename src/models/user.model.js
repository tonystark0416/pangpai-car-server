/**
 * 用户model底层,包括注册登陆，openid自动绑定登陆等底层方法
 * 设计上适用于所有平台的业务，用bizCode区分，一个应用登陆了，其他应用同样可以登陆
 */
const MySQL = require('../utils/mysql.js');

/**
 * 普通手机号注册方法
 * @param {string} biz_code
 * @param {string} phone
 * @returns
 */
async function registerUser(biz_code, phone) {
    const db = new MySQL();
    const sqlCheckUser = "select * from adp_user where phone = ?";
    const sqlRegisterUser = "INSERT INTO adp_user (biz_code,phone) values (?,?)";
    try {
        const res = await db.query(sqlCheckUser, phone)
        if (res[0]) {
            return -1 //已存在手机号
        } else {
            const res = await db.query(sqlRegisterUser, [biz_code, phone])
            if (res.affectedRows > 0) {
                const checkRes = await db.query(sqlCheckUser, phone)
                return checkRes[0]
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

/**
 * 根据openid自动注册，这里强制指小程序openid
 * @param {*} biz_code 业务编码
 * @param {*} openid 微信openid
 * @returns
 */
async function registerUserByOpenid(biz_code, openid) {
    const db = new MySQL();
    const sqlCheckUser = "select * from adp_user where openid = ?";
    const sqlRegisterUser = "INSERT INTO adp_user (biz_code,openid) values (?,?)";

    try {
        const res = await db.query(sqlCheckUser, openid)
        if (res[0]) {
            console.log('openid已存在绑定用户，可以直接登陆')
            return res[0]
        } else {
            const res = await db.query(sqlRegisterUser, [biz_code, openid])
            if (res.affectedRows > 0) {
                console.log('新账号注册成功')
                const checkRes = await db.query(sqlCheckUser, openid)
                return checkRes[0]
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

/**
 * 获取用户的驾驶证信息
 * @param {*} uid
 */
async function getUserDriverInfo(uid) {
    const sqlCheckDriver = "select * from pp_driver where user_id = ?";
    const db = new MySQL();
    const res = await db.query(sqlCheckDriver, uid)
    if (res[0]) {
        return res[0]
    } else {
        return -1
    }
}

/**
 * 更新用户的驾驶证信息
 */
async function updateUserDriverInfo(driver_idcard_name, driver_idcard_number, driver_idcard_url, driver_idcard_birth, uid) {
    //查询语句
    const sqlCheckDriver = "select * from pp_driver where user_id = ?";
    //新增插入
    const sqlAddDriver = "INSERT INTO pp_driver (user_id,driver_idcard_name,driver_idcard_number,driver_idcard_url,driver_idcard_birth) values (?,?,?,?,?)"
    //更新信息
    const sqlUpdateDriver = "UPDATE pp_driver SET driver_idcard_name = ?, driver_idcard_number = ? ,driver_idcard_url=?,driver_idcard_birth=? WHERE user_id = ? ";

    const db = new MySQL();

    const resCheck = await db.query(sqlCheckDriver, uid) //先查询是否存在记录

    if (resCheck[0]) {
        //执行更新
        const resUpdate = await db.query(sqlUpdateDriver, [driver_idcard_name, driver_idcard_number, driver_idcard_url, driver_idcard_birth, uid])

        if (resUpdate.affectedRows > 0) {
            console.log('更新成功')
            return 0
        } else {
            console.log('更新失败')
            return -1 //更新失败
        }
    } else {
        //执行新增插入
        const resAdd = await db.query(sqlAddDriver, [uid, driver_idcard_name, driver_idcard_number, driver_idcard_url, driver_idcard_birth])

        if (resAdd.affectedRows > 0) {
            console.log('新增司机记录成功')
            return 0
        } else {
            console.log('新增司机记录失败')
            return -1
        }
    }
}

module.exports = {
    registerUser,
    registerUserByOpenid,
    getUserDriverInfo,
    updateUserDriverInfo
}
