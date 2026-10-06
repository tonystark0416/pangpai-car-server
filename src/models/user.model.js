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
 * 根据 openid 自动注册/登录（v1.4.0 起走 adp_user_auth 授权表）
 *
 * 查找顺序：
 * ① (biz_code, openid) 精确命中 → 直接返回用户
 * ② 提供 unionid 且 ①未命中 → 按 unionid 找到其他小程序的授权 → 复用同一 user_id（跨端自动关联）
 * ③ 均未命中 → 新建 adp_user + adp_user_auth
 *
 * @param {string} biz_code 业务编码（区分共用 adp_user 的多个小程序）
 * @param {string} openid 该小程序下的微信 openid
 * @param {string} [unionid] 微信 unionid（两个小程序同属一个开放平台时才有，暂无）
 * @returns 用户行 | undefined
 */
async function registerUserByOpenid(biz_code, openid, unionid) {
    const db = new MySQL();
    const sqlSelectUserByAuth =
        "SELECT u.* FROM adp_user u JOIN adp_user_auth a ON a.user_id = u.id WHERE a.biz_code = ? AND a.openid = ? LIMIT 1";
    const sqlSelectUserByUnionid =
        "SELECT u.* FROM adp_user u JOIN adp_user_auth a ON a.user_id = u.id WHERE a.unionid = ? LIMIT 1";
    const sqlInsertUser = "INSERT INTO adp_user (biz_code) values (?)";
    const sqlInsertAuth =
        "INSERT INTO adp_user_auth (user_id, biz_code, openid, unionid) values (?,?,?,?)";

    try {
        // ① 按 (biz_code, openid) 查授权
        const authRes = await db.query(sqlSelectUserByAuth, [biz_code, openid]);
        if (authRes[0]) {
            console.log(`[user] openid已绑定（biz=${biz_code}），直接登录`);
            return authRes[0];
        }

        // ② unionid 跨业务关联：同一个人在另一小程序注册过，补一行授权挂到同一 user_id
        if (unionid) {
            const unionRes = await db.query(sqlSelectUserByUnionid, unionid);
            if (unionRes[0]) {
                await db.query(sqlInsertAuth, [unionRes[0].id, biz_code, openid, unionid]);
                console.log(`[user] unionid跨业务关联成功（user_id=${unionRes[0].id}）`);
                return unionRes[0];
            }
        }

        // ③ 全新用户
        const insertRes = await db.query(sqlInsertUser, [biz_code]);
        if (insertRes.insertId > 0) {
            await db.query(sqlInsertAuth, [insertRes.insertId, biz_code, openid, unionid || null]);
            console.log(`[user] 新账号注册成功（user_id=${insertRes.insertId}, biz=${biz_code}）`);
            const checkRes = await db.query("SELECT * FROM adp_user WHERE id = ?", insertRes.insertId);
            return checkRes[0];
        }
    } catch (error) {
        console.error('[user] registerUserByOpenid error:', error);
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
