/**
 * 管理后台数据层：管理员 / 用户 / 车辆 / 订单 的管理端查询
 */
const MySQL = require('../utils/mysql.js');
const dayjs = require('dayjs');

/** v1.6.18：车辆费用字段取值——非负数有效，空值回退默认 */
function feeValue(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pageParams(page = 1, pageSize = 10) {
  return {
    offset: (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize,
    pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10)),
  };
}

/* ================= 管理员 ================= */

async function getAdminByUsername(username) {
  const db = new MySQL();
  try {
    const res = await db.query('SELECT * FROM pp_admin_user WHERE username = ? LIMIT 1', [username]);
    return res[0];
  } finally {
    db.close();
  }
}

async function getAdminById(id) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'SELECT id, username, nickname, role, status, last_login_at, create_time FROM pp_admin_user WHERE id = ? LIMIT 1',
      [id]
    );
    return res[0];
  } finally {
    db.close();
  }
}

async function updateLastLogin(id) {
  const db = new MySQL();
  try {
    await db.query('UPDATE pp_admin_user SET last_login_at = NOW() WHERE id = ?', [id]);
  } finally {
    db.close();
  }
}

/* ================= 用户管理 ================= */

async function getUserList({ page = 1, pageSize = 10, keyword = '' }) {
  const { offset, pageSize: size } = pageParams(page, pageSize);
  const db = new MySQL();
  const like = `%${keyword}%`;
  const where = keyword
    ? 'WHERE u.phone LIKE ? OR u.nickname LIKE ? OR u.username LIKE ? OR EXISTS (SELECT 1 FROM pp_user_auth a WHERE a.user_id = u.id AND a.openid LIKE ?)'
    : '';
  const params = keyword ? [like, like, like, like] : [];
  try {
    const rows = await db.query(
      `SELECT u.*, (SELECT COUNT(*) FROM pp_order o WHERE o.uid = u.id) AS order_count,
              (SELECT COUNT(*) FROM pp_user_auth a WHERE a.user_id = u.id) AS auth_count
       FROM pp_user u ${where} ORDER BY u.id DESC LIMIT ?, ?`,
      [...params, offset, size]
    );
    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM pp_user u ${where}`, params);
    return { list: rows, total };
  } finally {
    db.close();
  }
}

async function getUserDetail(id) {
  const db = new MySQL();
  try {
    const [user] = await db.query('SELECT * FROM pp_user WHERE id = ? LIMIT 1', [id]);
    if (!user) return null;
    const auths = await db.query(
      'SELECT id, biz_code, openid, unionid, create_time FROM pp_user_auth WHERE user_id = ? ORDER BY id DESC',
      [id]
    );
    const [driver] = await db.query('SELECT * FROM pp_driver WHERE user_id = ? LIMIT 1', [id]);
    const orders = await db.query(
      'SELECT id, order_sn, car_id, total_price, pay_status, order_status, create_time FROM pp_order WHERE uid = ? ORDER BY id DESC LIMIT 20',
      [id]
    );
    return { user, auths, driver: driver || null, orders };
  } finally {
    db.close();
  }
}

/* ================= 车辆管理 ================= */

async function getCarList({ page = 1, pageSize = 10, keyword = '', status }) {
  const { offset, pageSize: size } = pageParams(page, pageSize);
  const db = new MySQL();
  const conditions = [];
  const params = [];
  if (keyword) {
    conditions.push('(car_name LIKE ? OR des LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (status !== undefined && status !== '' && status !== null) {
    conditions.push('status = ?');
    params.push(Number(status));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    // 管理端按 sort 升序展示，便于对照小程序端顺序调整
    const rows = await db.query(`SELECT * FROM pp_car ${where} ORDER BY sort ASC, id DESC LIMIT ?, ?`, [
      ...params,
      offset,
      size,
    ]);
    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM pp_car ${where}`, params);
    return { list: rows, total };
  } finally {
    db.close();
  }
}

async function createCar({ car_name, image_url, des, day_price, promotion_day_price, status, sort, clean_price, insurance_price_l1, insurance_price_l2 }) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'INSERT INTO pp_car (car_name, image_url, des, day_price, promotion_day_price, status, sort, clean_price, insurance_price_l1, insurance_price_l2) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        car_name,
        image_url,
        des || null,
        day_price,
        promotion_day_price || null,
        status === undefined || status === null ? 1 : Number(status),
        sort === undefined || sort === null || sort === '' ? 100 : Number(sort),
        // v1.6.18：费用配置缺省回到默认值（整备费 50、保险低档 100 / 高档 200）
        feeValue(clean_price, 50),
        feeValue(insurance_price_l1, 100),
        feeValue(insurance_price_l2, 200),
      ]
    );
    return res.insertId;
  } finally {
    db.close();
  }
}

async function updateCar(id, { car_name, image_url, des, day_price, promotion_day_price, status, sort, clean_price, insurance_price_l1, insurance_price_l2 }) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'UPDATE pp_car SET car_name = ?, image_url = ?, des = ?, day_price = ?, promotion_day_price = ?, status = ?, sort = ?, clean_price = ?, insurance_price_l1 = ?, insurance_price_l2 = ? WHERE id = ?',
      [
        car_name,
        image_url,
        des || null,
        day_price,
        promotion_day_price || null,
        status === undefined || status === null ? 1 : Number(status),
        sort === undefined || sort === null || sort === '' ? 100 : Number(sort),
        feeValue(clean_price, 50),
        feeValue(insurance_price_l1, 100),
        feeValue(insurance_price_l2, 200),
        id,
      ]
    );
    return res.affectedRows;
  } finally {
    db.close();
  }
}

/** 上下架快捷切换（1 上架 / 0 下架） */
async function updateCarStatus(id, status) {
  const db = new MySQL();
  try {
    const res = await db.query('UPDATE pp_car SET status = ? WHERE id = ?', [Number(status), id]);
    return res.affectedRows;
  } finally {
    db.close();
  }
}

async function deleteCar(id) {
  const db = new MySQL();
  try {
    // 有订单引用的车辆不允许删除，防止订单详情查不到车辆
    const [{ refs }] = await db.query('SELECT COUNT(*) AS refs FROM pp_order WHERE car_id = ?', [id]);
    if (refs > 0) return -1;
    const res = await db.query('DELETE FROM pp_car WHERE id = ?', [id]);
    return res.affectedRows;
  } finally {
    db.close();
  }
}

/* ================= 订单管理 ================= */

/** 构造订单查询条件（列表与导出共用，保证两边口径一致） */
function buildOrderWhere({ pay_status, order_status, keyword = '' }) {
  const conditions = [];
  const params = [];

  if (pay_status !== undefined && pay_status !== '' && pay_status !== null) {
    conditions.push('o.pay_status = ?');
    params.push(pay_status);
  }
  if (order_status !== undefined && order_status !== '' && order_status !== null) {
    conditions.push('o.order_status = ?');
    params.push(order_status);
  }
  if (keyword) {
    conditions.push('(o.order_sn LIKE ? OR o.contact_phone LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

async function getOrderList({ page = 1, pageSize = 10, pay_status, order_status, keyword = '' }) {
  const { offset, pageSize: size } = pageParams(page, pageSize);
  const db = new MySQL();
  const { where, params } = buildOrderWhere({ pay_status, order_status, keyword });

  try {
    const rows = await db.query(
      `SELECT o.*, c.car_name, c.image_url FROM pp_order o
       LEFT JOIN pp_car c ON c.id = o.car_id
       ${where} ORDER BY o.id DESC LIMIT ?, ?`,
      [...params, offset, size]
    );
    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM pp_order o ${where}`, params);
    return { list: rows, total };
  } finally {
    db.close();
  }
}

async function getOrderDetail(id) {
  const db = new MySQL();
  try {
    const [order] = await db.query(
      `SELECT o.*, c.car_name, c.image_url, c.des AS car_des
       FROM pp_order o LEFT JOIN pp_car c ON c.id = o.car_id
       WHERE o.id = ? LIMIT 1`,
      [id]
    );
    if (!order) return null;
    if (order.uid) {
      const [user] = await db.query('SELECT id, phone, nickname, username FROM pp_user WHERE id = ?', [
        order.uid,
      ]);
      order.userInfo = user || null;
    }
    return order;
  } finally {
    db.close();
  }
}

async function updateOrderStatus(id, order_status) {
  const db = new MySQL();
  try {
    const res = await db.query('UPDATE pp_order SET order_status = ? WHERE id = ?', [order_status, id]);
    return res.affectedRows;
  } finally {
    db.close();
  }
}

/** 修改订单取车/还车地址（v1.6.10，两个字段至少传一个） */
async function updateOrderAddress(id, { pickup_address, return_address }) {
  const db = new MySQL();
  const sets = [];
  const params = [];
  if (pickup_address !== undefined) {
    sets.push('pickup_address = ?');
    params.push(pickup_address);
  }
  if (return_address !== undefined) {
    sets.push('return_address = ?');
    params.push(return_address);
  }
  if (!sets.length) return 0;
  try {
    const res = await db.query(`UPDATE pp_order SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    return res.affectedRows;
  } finally {
    db.close();
  }
}

/* ================= 概览统计 ================= */

/**
 * 近 N 日订单统计（v1.6.13，用于概览页趋势）
 * 按 create_time 分组统计每日「订单数 / 已支付数 / 已支付金额」，并补齐无订单的日期
 * @param {number} days 天数，默认 7
 * @returns {Array<{date, weekday, orderTotal, paidCount, paidAmount}>} 按日期升序（最早在前）
 */
async function getRecentOrderStats(days = 7) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      `SELECT DATE(create_time) AS date,
              COUNT(*) AS order_total,
              SUM(CASE WHEN pay_status = 1 THEN 1 ELSE 0 END) AS paid_count,
              IFNULL(SUM(CASE WHEN pay_status = 1 THEN total_price ELSE 0 END), 0) AS paid_amount
       FROM pp_order
       WHERE create_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(create_time)
       ORDER BY date ASC`,
      [days - 1]
    );

    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const map = new Map();
    rows.forEach((r) => {
      // mysql2 对 DATE() 返回 Date 对象，统一格式化为 YYYY-MM-DD
      const d = r.date instanceof Date ? dayjs(r.date).format('YYYY-MM-DD') : String(r.date);
      map.set(d, r);
    });

    const result = [];
    const today = dayjs().startOf('day');
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = today.subtract(i, 'day');
      const key = d.format('YYYY-MM-DD');
      const row = map.get(key);
      result.push({
        date: key,
        weekday: weekNames[d.day()],
        orderTotal: row ? Number(row.order_total) : 0,
        paidCount: row ? Number(row.paid_count) : 0,
        paidAmount: row ? Number(row.paid_amount) : 0,
      });
    }
    // 无数据时前端需要区分「加载中/无数据」，这里一并给出合计
    const summary = result.reduce(
      (acc, cur) => ({
        orderTotal: acc.orderTotal + cur.orderTotal,
        paidCount: acc.paidCount + cur.paidCount,
        paidAmount: acc.paidAmount + cur.paidAmount,
      }),
      { orderTotal: 0, paidCount: 0, paidAmount: 0 }
    );
    return { list: result, summary };
  } finally {
    db.close();
  }
}

/**
 * 导出订单（v1.6.13）
 * 与列表共用筛选条件，但不分页；用上限保护内存
 * @param {object} params 筛选条件 {pay_status, order_status, keyword}
 * @param {number} limit 最大导出条数，默认 20000
 */
async function getOrderExportList(params = {}, limit = 20000) {
  const db = new MySQL();
  const { where, params: bind } = buildOrderWhere(params);
  try {
    const rows = await db.query(
      `SELECT o.*, c.car_name FROM pp_order o
       LEFT JOIN pp_car c ON c.id = o.car_id
       ${where} ORDER BY o.id DESC LIMIT ?`,
      [...bind, limit]
    );
    return rows;
  } finally {
    db.close();
  }
}

async function getDashboardStats() {
  const db = new MySQL();
  try {
    const [userTotal] = await db.query('SELECT COUNT(*) AS v FROM pp_user');
    const [carTotal] = await db.query('SELECT COUNT(*) AS v FROM pp_car');
    const [orderTotal] = await db.query('SELECT COUNT(*) AS v FROM pp_order');
    const [orderPaid] = await db.query('SELECT COUNT(*) AS v FROM pp_order WHERE pay_status = 1');
    const [orderToday] = await db.query(
      'SELECT COUNT(*) AS v FROM pp_order WHERE DATE(create_time) = CURDATE()'
    );
    const [paidToday] = await db.query(
      'SELECT COUNT(*) AS v, IFNULL(SUM(total_price),0) AS amount FROM pp_order WHERE pay_status = 1 AND DATE(pay_time) = CURDATE()'
    );
    return {
      userTotal: userTotal.v,
      carTotal: carTotal.v,
      orderTotal: orderTotal.v,
      orderPaid: orderPaid.v,
      orderToday: orderToday.v,
      paidToday: paidToday.v,
      paidTodayAmount: Number(paidToday.amount),
    };
  } finally {
    db.close();
  }
}

module.exports = {
  getAdminByUsername,
  getAdminById,
  updateLastLogin,
  getUserList,
  getUserDetail,
  getCarList,
  createCar,
  updateCar,
  updateCarStatus,
  deleteCar,
  getOrderList,
  getOrderDetail,
  updateOrderStatus,
  updateOrderAddress,
  getDashboardStats,
  getRecentOrderStats,
  getOrderExportList,
};
