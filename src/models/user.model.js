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
    const sqlCheckUser = "select * from pp_user where phone = ?";
    const sqlRegisterUser = "INSERT INTO pp_user (biz_code,phone) values (?,?)";
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
 * 按 openid 登录（v1.7.0 起：**只查不注册**）
 *
 * 新账号体系改为「手机号注册 → 再绑定 openid/unionid」，openid 不再作为注册依据，
 * 因此未绑定的 openid 一律返回 null，由前端引导走手机号授权。
 *
 * 查找顺序：
 * ① (biz_code, openid) 精确命中且用户存在 → 返回用户
 * ② 提供 unionid 且 ①未命中 → 按 unionid 找到同一人的其他授权 → 补一行 openid 授权后返回
 * ③ 均未命中 → 返回 null（**不再新建用户**）
 *
 * 另：若授权行存在但 pp_user 行已被删除（孤儿授权，会导致该 openid 永久登录失败），
 * 会自动清理该孤儿行，让这个 openid 可以重新走手机号注册绑定。
 *
 * @param {string} biz_code 业务编码
 * @param {string} openid 该小程序下的微信 openid
 * @param {string} [unionid] 微信 unionid（暂无，待开放平台关联）
 * @returns 用户行 | null（null = 未注册，需走手机号）
 */
async function loginByOpenid(biz_code, openid, unionid) {
    const db = new MySQL();
    const sqlSelectUserByAuth =
        "SELECT u.* FROM pp_user u JOIN pp_user_auth a ON a.user_id = u.id WHERE a.biz_code = ? AND a.openid = ? LIMIT 1";
    const sqlSelectUserByUnionid =
        "SELECT u.* FROM pp_user u JOIN pp_user_auth a ON a.user_id = u.id WHERE a.unionid = ? LIMIT 1";
    const sqlInsertAuth =
        "INSERT INTO pp_user_auth (user_id, biz_code, openid, unionid) values (?,?,?,?)";

    try {
        // ① 按 (biz_code, openid) 查授权
        const authRes = await db.query(sqlSelectUserByAuth, [biz_code, openid]);
        if (authRes[0]) {
            console.log(`[user] openid已绑定（biz=${biz_code}），直接登录`);
            return authRes[0];
        }

        // ①-b 授权行还在、但用户行没了（孤儿授权）→ 清理，避免该 openid 被永久堵死
        const orphan = await db.query(
            "SELECT a.id, a.user_id FROM pp_user_auth a LEFT JOIN pp_user u ON u.id = a.user_id WHERE a.biz_code = ? AND a.openid = ? AND u.id IS NULL LIMIT 1",
            [biz_code, openid]
        );
        if (orphan[0]) {
            await db.query("DELETE FROM pp_user_auth WHERE id = ?", [orphan[0].id]);
            console.log(
                `[user] 清理孤儿授权行 auth_id=${orphan[0].id}（原 user_id=${orphan[0].user_id} 已不存在）`
            );
        }

        // ② unionid 跨业务关联
        if (unionid) {
            const unionRes = await db.query(sqlSelectUserByUnionid, unionid);
            if (unionRes[0]) {
                await db.query(sqlInsertAuth, [unionRes[0].id, biz_code, openid, unionid]);
                console.log(`[user] unionid跨业务关联成功（user_id=${unionRes[0].id}）`);
                return unionRes[0];
            }
        }

        // ③ 未注册：返回 null，由前端引导手机号注册
        console.log(`[user] openid未绑定任何账号（biz=${biz_code}），需手机号注册`);
        return null;
    } catch (error) {
        console.error('[user] loginByOpenid error:', error);
        return null;
    } finally {
        db.close();
    }
}

/**
 * 手机号注册/登录（v1.7.0 新账号体系主入口）
 *
 * 规则：手机号是账号唯一标识（pp_user.phone 有唯一索引）
 * ① 手机号已存在 → 直接登录到该账号，并把当前 openid/unionid 绑上去（同一手机号视为同一人）
 * ② 手机号不存在 → 新建 pp_user(phone) 得到 uid，再绑定 openid/unionid
 *
 * 返回值约定（与既有代码风格一致）：
 *   用户行    成功
 *   -2       该 openid 已绑定到另一个账号（拒绝，避免串号）
 *   undefined 写入失败
 *
 * @param {string} biz_code 业务编码
 * @param {string} phone 微信手机号快速验证拿到的 purePhoneNumber
 * @param {string} [openid] 同时绑定
 * @param {string} [unionid] 同时绑定
 */
async function loginOrRegisterByPhone(biz_code, phone, openid, unionid) {
    const db = new MySQL();
    try {
        // ① 手机号已注册 → 登录到已有账号
        const existRes = await db.query("SELECT * FROM pp_user WHERE phone = ? LIMIT 1", [phone]);
        let userRow = existRes[0];

        if (!userRow) {
            // ② 新手机号 → 注册
            const insertRes = await db.query("INSERT INTO pp_user (biz_code, phone) values (?,?)", [biz_code, phone]);
            if (!insertRes.insertId) {
                console.error('[user] 手机号注册失败');
                return undefined;
            }
            const checkRes = await db.query("SELECT * FROM pp_user WHERE id = ?", insertRes.insertId);
            userRow = checkRes[0];
            console.log(`[user] 手机号注册成功（user_id=${userRow.id}, phone=${phone}）`);
        } else {
            console.log(`[user] 手机号已注册，直接登录（user_id=${userRow.id}）`);
        }

        // ③ 绑定 openid/unionid
        if (openid) {
            const bindRes = await ensureAuth(userRow.id, biz_code, openid, unionid);
            if (bindRes === -2) {
                // openid 已绑到别的账号：回滚本次新建的用户，避免留下无主账号
                console.error(`[user] openid 已绑定其他账号，拒绝注册（openid=${openid}）`);
                return -2;
            }
        }
        return userRow;
    } catch (error) {
        console.error('[user] loginOrRegisterByPhone error:', error);
        return undefined;
    } finally {
        db.close();
    }
}

/**
 * 确保 (biz_code, openid) 这一行授权挂在指定 user_id 上
 * @returns 0 成功/已存在 | -2 openid 已绑定到其他账号
 */
async function ensureAuth(user_id, biz_code, openid, unionid) {
    const db = new MySQL();
    try {
        const authRes = await db.query(
            "SELECT * FROM pp_user_auth WHERE biz_code = ? AND openid = ? LIMIT 1",
            [biz_code, openid]
        );
        const authRow = authRes[0];

        if (!authRow) {
            await db.query(
                "INSERT INTO pp_user_auth (user_id, biz_code, openid, unionid) values (?,?,?,?)",
                [user_id, biz_code, openid, unionid || null]
            );
            console.log(`[user] openid绑定成功（user_id=${user_id}, biz=${biz_code}）`);
            return 0;
        }

        if (Number(authRow.user_id) !== Number(user_id)) {
            // 该 openid 已经是另一个账号的授权，绝不能改写，否则两个账号会串号
            return -2;
        }

        // 已绑定本账号：补齐 unionid
        if (unionid && authRow.unionid !== unionid) {
            await db.query("UPDATE pp_user_auth SET unionid = ? WHERE id = ?", [unionid, authRow.id]);
            console.log(`[user] unionid 已补齐（auth_id=${authRow.id}）`);
        }
        return 0;
    } catch (error) {
        console.error('[user] ensureAuth error:', error);
        return -1;
    } finally {
        db.close();
    }
}

/**
 * 给已登录用户补填/更新手机号（老用户无手机号时的补授权入口）
 * @param {number} uid
 * @param {string} phone
 * @returns 0 成功 | -1 用户不存在 | -2 手机号已被其他账号占用
 */
async function updateUserPhone(uid, phone) {
    const db = new MySQL();
    try {
        const userRes = await db.query("SELECT * FROM pp_user WHERE id = ? LIMIT 1", [uid]);
        if (!userRes[0]) return -1;

        const conflict = await db.query(
            "SELECT id FROM pp_user WHERE phone = ? AND id <> ? LIMIT 1",
            [phone, uid]
        );
        if (conflict[0]) return -2;

        await db.query("UPDATE pp_user SET phone = ? WHERE id = ?", [phone, uid]);
        console.log(`[user] 手机号已更新（user_id=${uid}）`);
        return 0;
    } catch (error) {
        console.error('[user] updateUserPhone error:', error);
        return -1;
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
    loginByOpenid,
    loginOrRegisterByPhone,
    ensureAuth,
    updateUserPhone,
    getUserDriverInfo,
    updateUserDriverInfo
}
