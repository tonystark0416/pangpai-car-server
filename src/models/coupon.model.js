/**
 * 优惠券数据模型（v1.7.3）
 *
 * 两张表：
 *   pp_coupon      券批次（后台创建：面额、库存、领取/使用时间、适用范围、限领/限用）
 *   pp_user_coupon 用户券（领券时生成唯一券码 coupon_sn，并快照面额与适用范围，避免批次后续被改动带来口径漂移）
 *
 * 金额口径：订单 total_price 保持原价，本模块只产出 discount_price（抵扣额），
 * 实付 pay_amount = total_price - discount_price 由计价服务计算。
 *
 * 并发安全：
 *   库存   —— UPDATE ... WHERE remain_stock > 0 原子扣减，扣不到即无库存
 *   限领   —— 先 COUNT 校验，再 INSERT 带 receive_seq，靠唯一键 uk_coupon_uid_seq 硬兜底
 *   核销   —— UPDATE ... WHERE coupon_sn=? AND status=0，affectedRows=0 即已被占用
 */
const MySQL = require('../utils/mysql.js');

/** 批次状态：0未开始 1活动中 2已废弃 */
const COUPON_STATUS = { NOT_START: 0, ACTIVE: 1, DISCARDED: 2 };
/** 用户券状态：0未使用 1已使用 2已作废 */
const USER_COUPON_STATUS = { UNUSED: 0, USED: 1, INVALID: 2 };

const COUPON_STATUS_TEXT = { 0: '未开始', 1: '活动中', 2: '已废弃' };
const USER_COUPON_STATUS_TEXT = { 0: '未使用', 1: '已使用', 2: '已作废' };

function randStr(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < n; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 批次号：CP + 日期 + 6 位随机（如 CP20261025A1B2C3） */
function genCouponId() {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `CP${day}${randStr(6)}`;
}

/** 券码：CP + 毫秒时间戳 + 6 位随机，保证全局唯一且不可枚举 */
function genCouponSn() {
  return `CP${Date.now()}${randStr(6)}`;
}

/** 把 '2026-10-25 10:00' / ISO 字符串统一成 MySQL 可用的 datetime 字符串 */
function normalizeTime(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string' && v.includes('T')) return v.replace('T', ' ').slice(0, 19);
  return String(v);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/* ============================ 批次管理（后台） ============================ */

/**
 * 创建券批次
 * @param {object} p
 * @returns {object} 新建批次行 | undefined
 */
async function createCoupon(p) {
  const db = new MySQL();
  const couponId = p.coupon_id || genCouponId();
  const sql = `INSERT INTO pp_coupon
    (coupon_id,name,amount,threshold,total_stock,remain_stock,per_limit,use_per_limit,
     receive_start_time,receive_end_time,use_start_time,use_end_time,
     scope_type,scope_car_ids,user_scope,bear_type,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  try {
    const res = await db.query(sql, [
      couponId,
      p.name,
      round2(p.amount),
      round2(p.threshold || 0),
      Number(p.total_stock),
      Number(p.total_stock), // 初始剩余 = 总库存
      Number(p.per_limit || 1),
      Number(p.use_per_limit || 1),
      normalizeTime(p.receive_start_time),
      normalizeTime(p.receive_end_time),
      normalizeTime(p.use_start_time),
      normalizeTime(p.use_end_time),
      Number(p.scope_type || 1),
      p.scope_car_ids || null,
      Number(p.user_scope || 0),
      p.bear_type || 'platform',
      Number(p.status === undefined ? COUPON_STATUS.NOT_START : p.status),
    ]);
    if (!res.insertId) return undefined;
    const rows = await db.query('SELECT * FROM pp_coupon WHERE id = ?', res.insertId);
    return rows[0];
  } catch (error) {
    console.error('[coupon] createCoupon error:', error.message);
    return undefined;
  } finally {
    db.close();
  }
}

/**
 * 编辑券批次（仅「未开始」状态允许改核心规则；库存只能通过追加总量调整）
 * @returns 0 成功 | -1 不存在 | -2 状态不允许编辑
 */
async function updateCoupon(id, p) {
  const db = new MySQL();
  try {
    const rows = await db.query('SELECT * FROM pp_coupon WHERE id = ?', id);
    const row = rows[0];
    if (!row) return -1;
    if (Number(row.status) !== COUPON_STATUS.NOT_START) {
      // 活动中的券改规则会影响用户已领权益，只允许改库存
      if (p.total_stock === undefined) return -2;
      const add = Number(p.total_stock) - Number(row.total_stock);
      if (add <= 0) return -2;
      await db.query(
        'UPDATE pp_coupon SET total_stock = ?, remain_stock = remain_stock + ? WHERE id = ?',
        [Number(p.total_stock), add, id]
      );
      return 0;
    }

    await db.query(
      `UPDATE pp_coupon SET name=?, amount=?, threshold=?, total_stock=?, remain_stock=?,
       per_limit=?, use_per_limit=?, receive_start_time=?, receive_end_time=?,
       use_start_time=?, use_end_time=?, scope_type=?, scope_car_ids=?, user_scope=?, bear_type=?
       WHERE id = ?`,
      [
        p.name ?? row.name,
        round2(p.amount ?? row.amount),
        round2(p.threshold ?? row.threshold),
        Number(p.total_stock ?? row.total_stock),
        Number(p.remain_stock ?? p.total_stock ?? row.remain_stock),
        Number(p.per_limit ?? row.per_limit),
        Number(p.use_per_limit ?? row.use_per_limit),
        normalizeTime(p.receive_start_time) ?? row.receive_start_time,
        normalizeTime(p.receive_end_time) ?? row.receive_end_time,
        normalizeTime(p.use_start_time) ?? row.use_start_time,
        normalizeTime(p.use_end_time) ?? row.use_end_time,
        Number(p.scope_type ?? row.scope_type),
        p.scope_car_ids !== undefined ? p.scope_car_ids : row.scope_car_ids,
        Number(p.user_scope ?? row.user_scope),
        p.bear_type ?? row.bear_type,
        id,
      ]
    );
    return 0;
  } catch (error) {
    console.error('[coupon] updateCoupon error:', error.message);
    return -1;
  } finally {
    db.close();
  }
}

/** 批次详情 */
async function getCouponById(id) {
  const db = new MySQL();
  try {
    const rows = await db.query('SELECT * FROM pp_coupon WHERE id = ?', id);
    return rows[0];
  } finally {
    db.close();
  }
}

/** 批次列表（后台分页 + 名称/状态筛选） */
async function getCouponList({ page = 1, pageSize = 10, name, status } = {}) {
  const db = new MySQL();
  try {
    const where = ['1=1'];
    const params = [];
    if (name) {
      where.push('(name LIKE ? OR coupon_id LIKE ?)');
      params.push(`%${name}%`, `%${name}%`);
    }
    if (status !== undefined && status !== null && status !== '') {
      where.push('status = ?');
      params.push(Number(status));
    }
    const whereSql = where.join(' AND ');
    const offset = (Number(page) - 1) * Number(pageSize);
    const list = await db.query(
      `SELECT *,
              (SELECT COUNT(*) FROM pp_user_coupon u WHERE u.coupon_id = pp_coupon.coupon_id) AS received_count,
              (SELECT COUNT(*) FROM pp_user_coupon u WHERE u.coupon_id = pp_coupon.coupon_id AND u.status = 1) AS used_count
       FROM pp_coupon WHERE ${whereSql}
       ORDER BY create_time DESC LIMIT ?,?`,
      [...params, offset, Number(pageSize)]
    );
    const [countRow] = await db.query(`SELECT COUNT(*) total FROM pp_coupon WHERE ${whereSql}`, params);
    return { list, total: Number(countRow.total) };
  } finally {
    db.close();
  }
}

/**
 * 切换批次状态：未开始 → 活动中 → 已废弃
 * @param {number} id
 * @param {number} status 0|1|2
 * @returns 0 成功 | -1 不存在 | -2 非法状态流转
 */
async function updateCouponStatus(id, status) {
  const db = new MySQL();
  try {
    const target = Number(status);
    if (![0, 1, 2].includes(target)) return -2;

    const rows = await db.query('SELECT * FROM pp_coupon WHERE id = ?', id);
    const row = rows[0];
    if (!row) return -1;

    // 已废弃的批次不可逆（避免误操作把作废券再启回来）
    if (Number(row.status) === COUPON_STATUS.DISCARDED) return -2;

    await db.query('UPDATE pp_coupon SET status = ? WHERE id = ?', [target, id]);

    // 决策：废除批次时，用户已领但未使用的券一并作废（status=2）
    if (target === COUPON_STATUS.DISCARDED) {
      const res = await db.query(
        'UPDATE pp_user_coupon SET status = ? WHERE coupon_id = ? AND status = ?',
        [USER_COUPON_STATUS.INVALID, row.coupon_id, USER_COUPON_STATUS.UNUSED]
      );
      console.log(`[coupon] 批次 ${row.coupon_id} 已废弃，连带作废用户未用券 ${res.affectedRows} 张`);
    }
    return 0;
  } catch (error) {
    console.error('[coupon] updateCouponStatus error:', error.message);
    return -1;
  } finally {
    db.close();
  }
}

/* ============================ 领券 / 我的券（C 端） ============================ */

/**
 * 可领取列表：活动中且在领取时间内的批次
 * 附带当前用户已领张数、是否还能领
 */
async function listReceiveable(uid) {
  const db = new MySQL();
  try {
    const list = await db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM pp_user_coupon u WHERE u.coupon_id = c.coupon_id AND u.uid = ?) AS my_received
       FROM pp_coupon c
       WHERE c.status = 1 AND NOW() BETWEEN c.receive_start_time AND c.receive_end_time
       ORDER BY c.amount DESC, c.id DESC`,
      [uid]
    );
    return list.map((r) => ({
      coupon_id: r.coupon_id,
      name: r.name,
      amount: Number(r.amount),
      receive_start_time: r.receive_start_time,
      receive_end_time: r.receive_end_time,
      use_start_time: r.use_start_time,
      use_end_time: r.use_end_time,
      scope_type: Number(r.scope_type),
      remain_stock: Number(r.remain_stock),
      per_limit: Number(r.per_limit),
      my_received: Number(r.my_received),
      can_receive: Number(r.remain_stock) > 0 && Number(r.my_received) < Number(r.per_limit),
    }));
  } finally {
    db.close();
  }
}

/**
 * 领券：原子扣库存 → 校验限领 → 生成券码
 * @returns {object} 新券对象
 *          -1 批次不存在或未在活动中
 *          -2 已被领完
 *          -3 超过每人限领张数
 *          -4 写入失败（并发冲突等）
 */
async function receiveCoupon(uid, couponId) {
  const db = new MySQL();
  try {
    // ① 原子扣库存（同时校验状态与领取时间窗口）
    const stockRes = await db.query(
      `UPDATE pp_coupon SET remain_stock = remain_stock - 1
       WHERE coupon_id = ? AND status = 1 AND remain_stock > 0
         AND NOW() BETWEEN receive_start_time AND receive_end_time`,
      [couponId]
    );
    if (stockRes.affectedRows === 0) {
      const rows = await db.query('SELECT * FROM pp_coupon WHERE coupon_id = ?', [couponId]);
      const row = rows[0];
      if (!row) return -1;
      if (Number(row.status) !== COUPON_STATUS.ACTIVE) return -1;
      if (Number(row.remain_stock) <= 0) return -2;
      return -1; // 不在领取时间窗口内
    }

    try {
      // ② 限领校验
      const rows = await db.query('SELECT * FROM pp_coupon WHERE coupon_id = ?', [couponId]);
      const row = rows[0];
      const [countRow] = await db.query(
        'SELECT COUNT(*) n FROM pp_user_coupon WHERE coupon_id = ? AND uid = ?',
        [couponId, uid]
      );
      if (Number(countRow.n) >= Number(row.per_limit)) {
        // 限领拦截发生在扣库存之后，必须把库存加回去，否则库存会被白扣（越领越少）
        await db.query('UPDATE pp_coupon SET remain_stock = remain_stock + 1 WHERE coupon_id = ?', [couponId]);
        return -3;
      }

      // ③ 落用户券（快照面额与适用范围）
      const couponSn = genCouponSn();
      const res = await db.query(
        `INSERT INTO pp_user_coupon
         (coupon_sn,coupon_id,uid,name,amount,scope_type,scope_car_ids,use_start_time,use_end_time,status,receive_seq)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          couponSn,
          couponId,
          uid,
          row.name,
          Number(row.amount),
          Number(row.scope_type),
          row.scope_car_ids,
          row.use_start_time,
          row.use_end_time,
          USER_COUPON_STATUS.UNUSED,
          Number(countRow.n) + 1,
        ]
      );
      if (!res.insertId) return -4;
      return {
        coupon_sn: couponSn,
        coupon_id: couponId,
        name: row.name,
        amount: Number(row.amount),
        use_start_time: row.use_start_time,
        use_end_time: row.use_end_time,
      };
    } catch (inner) {
      // 领券后续失败 → 回滚库存
      await db.query('UPDATE pp_coupon SET remain_stock = remain_stock + 1 WHERE coupon_id = ?', [couponId]);
      throw inner;
    }
  } catch (error) {
    console.error('[coupon] receiveCoupon error:', error.message);
    return -4;
  } finally {
    db.close();
  }
}

/**
 * 我的券包
 * @param {number} uid
 * @param {object} [opt] { carId, status, onlyAvailable }  carId 用于筛选当前车辆可用
 */
async function getUserCoupons(uid, { carId, status, amount } = {}) {
  const db = new MySQL();
  try {
    const where = ['u.uid = ?'];
    const params = [uid];
    if (status !== undefined && status !== null && status !== '') {
      where.push('u.status = ?');
      params.push(Number(status));
    }
    if (carId) {
      where.push('(u.scope_type = 1 OR (u.scope_type = 2 AND FIND_IN_SET(?, IFNULL(u.scope_car_ids,\'\'))))');
      params.push(Number(carId));
    }
    const rows = await db.query(
      `SELECT u.* FROM pp_user_coupon u WHERE ${where.join(' AND ')}
       ORDER BY u.status ASC, u.use_end_time ASC, u.id DESC`,
      params
    );
    // usable / unusable_reason 一并算好，前端可直接置灰并提示原因
    return rows.map((r) => {
      const check = validateCoupon(r, { carId, orderAmount: amount });
      return {
        coupon_sn: r.coupon_sn,
        coupon_id: r.coupon_id,
        name: r.name,
        amount: Number(r.amount),
        scope_type: Number(r.scope_type),
        use_start_time: r.use_start_time,
        use_end_time: r.use_end_time,
        status: Number(r.status),
        status_text: USER_COUPON_STATUS_TEXT[r.status],
        receive_time: r.receive_time,
        usable: check.ok,
        unusable_reason: check.ok ? '' : check.msg,
      };
    });
  } finally {
    db.close();
  }
}

/** 按券码取一张用户券（含归属校验） */
async function getUserCouponBySn(couponSn, uid) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      'SELECT * FROM pp_user_coupon WHERE coupon_sn = ? AND uid = ? LIMIT 1',
      [couponSn, uid]
    );
    return rows[0];
  } finally {
    db.close();
  }
}

/** 是否传了有效的订单金额（用于判断是否启用「金额门槛」校验） */
function isAmountGiven(v) {
  return v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));
}

/**
 * 券可用性校验（结算/下单前）
 * @param {object} couponRow pp_user_coupon 行
 * @param {object} [opt]
 * @param {number|string} [opt.carId] 当前结算车辆，用于校验适用范围
 * @param {number|string} [opt.orderAmount] 本次订单原价（元），给定时要求 **orderAmount > 券面额** 才可用
 * @returns {{ok:boolean, msg?:string, coupon?:object}}
 */
function validateCoupon(couponRow, { carId, orderAmount } = {}) {
  if (!couponRow) return { ok: false, msg: '优惠券不存在' };
  if (Number(couponRow.status) === USER_COUPON_STATUS.USED) return { ok: false, msg: '优惠券已使用' };
  if (Number(couponRow.status) === USER_COUPON_STATUS.INVALID) return { ok: false, msg: '优惠券已作废' };

  const now = Date.now();
  if (new Date(couponRow.use_start_time).getTime() > now) {
    return { ok: false, msg: '优惠券尚未到可用时间' };
  }
  if (new Date(couponRow.use_end_time).getTime() < now) {
    return { ok: false, msg: '优惠券已过期' };
  }
  if (Number(couponRow.scope_type) === 2) {
    const ids = String(couponRow.scope_car_ids || '').split(',').map((s) => Number(s.trim()));
    if (!carId || !ids.includes(Number(carId))) {
      return { ok: false, msg: '该优惠券不适用于当前车辆' };
    }
  }
  // v1.7.3 补充规则：订单金额必须**大于**券面额才可用
  //   订单金额 ≤ 券面额 → 券不可用（避免 0 元订单与「倒找钱」的歧义）
  if (isAmountGiven(orderAmount)) {
    if (Number(orderAmount) <= Number(couponRow.amount)) {
      return { ok: false, msg: '订单金额需大于优惠券面额，该券本次不可用' };
    }
  }
  return { ok: true, coupon: couponRow };
}

/**
 * 核销券（下单成功后绑定订单号）
 * @returns affectedRows：1=成功；0=券不存在/已被使用（并发防重复）
 */
async function useCoupon(couponSn, orderSn) {
  const db = new MySQL();
  try {
    const res = await db.query(
      `UPDATE pp_user_coupon SET status = ?, order_sn = ?, use_time = NOW()
       WHERE coupon_sn = ? AND status = ?`,
      [USER_COUPON_STATUS.USED, orderSn, couponSn, USER_COUPON_STATUS.UNUSED]
    );
    return res.affectedRows;
  } catch (error) {
    console.error('[coupon] useCoupon error:', error.message);
    return -1;
  } finally {
    db.close();
  }
}

/** 下单失败时的回滚：把券还原为未使用 */
async function revertCoupon(couponSn) {
  const db = new MySQL();
  try {
    await db.query(
      'UPDATE pp_user_coupon SET status = ?, order_sn = NULL, use_time = NULL WHERE coupon_sn = ? AND status = ?',
      [USER_COUPON_STATUS.UNUSED, couponSn, USER_COUPON_STATUS.USED]
    );
  } catch (error) {
    console.error('[coupon] revertCoupon error:', error.message);
  } finally {
    db.close();
  }
}

/**
 * 退款退券：把订单已核销的券还原为未使用
 * 决策口径：券退回账户可再次使用；**若有效期已过则不退回**（退回去也用不了，避免脏数据）
 * @returns 'returned' 已退回 | 'expired' 有效期已过，不退回 | 'none' 订单未用券或券不存在
 */
async function returnCouponByOrder(orderSn) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      'SELECT * FROM pp_user_coupon WHERE order_sn = ? AND status = ? LIMIT 1',
      [orderSn, USER_COUPON_STATUS.USED]
    );
    const row = rows[0];
    if (!row) return 'none';

    if (new Date(row.use_end_time).getTime() < Date.now()) {
      console.log(`[coupon] 订单 ${orderSn} 的券 ${row.coupon_sn} 有效期已过，退款不退回`);
      return 'expired';
    }
    await db.query(
      'UPDATE pp_user_coupon SET status = ?, order_sn = NULL, use_time = NULL WHERE id = ?',
      [USER_COUPON_STATUS.UNUSED, row.id]
    );
    console.log(`[coupon] 订单 ${orderSn} 退款，券 ${row.coupon_sn} 已退回账户`);
    return 'returned';
  } catch (error) {
    console.error('[coupon] returnCouponByOrder error:', error.message);
    return 'none';
  } finally {
    db.close();
  }
}

module.exports = {
  COUPON_STATUS,
  USER_COUPON_STATUS,
  COUPON_STATUS_TEXT,
  USER_COUPON_STATUS_TEXT,
  genCouponId,
  createCoupon,
  updateCoupon,
  getCouponById,
  getCouponList,
  updateCouponStatus,
  listReceiveable,
  receiveCoupon,
  getUserCoupons,
  getUserCouponBySn,
  validateCoupon,
  useCoupon,
  revertCoupon,
  returnCouponByOrder,
};
