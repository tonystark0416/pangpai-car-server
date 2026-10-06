/**
 * 管理后台数据层：管理员 / 用户 / 车辆 / 订单 的管理端查询
 */
const MySQL = require('../utils/mysql.js');

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
    const res = await db.query('SELECT * FROM adp_admin_user WHERE username = ? LIMIT 1', [username]);
    return res[0];
  } finally {
    db.close();
  }
}

async function getAdminById(id) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'SELECT id, username, nickname, role, status, last_login_at, create_time FROM adp_admin_user WHERE id = ? LIMIT 1',
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
    await db.query('UPDATE adp_admin_user SET last_login_at = NOW() WHERE id = ?', [id]);
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
    ? 'WHERE u.phone LIKE ? OR u.nickname LIKE ? OR u.username LIKE ? OR EXISTS (SELECT 1 FROM adp_user_auth a WHERE a.user_id = u.id AND a.openid LIKE ?)'
    : '';
  const params = keyword ? [like, like, like, like] : [];
  try {
    const rows = await db.query(
      `SELECT u.*, (SELECT COUNT(*) FROM pp_order o WHERE o.uid = u.id) AS order_count,
              (SELECT COUNT(*) FROM adp_user_auth a WHERE a.user_id = u.id) AS auth_count
       FROM adp_user u ${where} ORDER BY u.id DESC LIMIT ?, ?`,
      [...params, offset, size]
    );
    const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM adp_user u ${where}`, params);
    return { list: rows, total };
  } finally {
    db.close();
  }
}

async function getUserDetail(id) {
  const db = new MySQL();
  try {
    const [user] = await db.query('SELECT * FROM adp_user WHERE id = ? LIMIT 1', [id]);
    if (!user) return null;
    const auths = await db.query(
      'SELECT id, biz_code, openid, unionid, create_time FROM adp_user_auth WHERE user_id = ? ORDER BY id DESC',
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

async function getCarList({ page = 1, pageSize = 10, keyword = '' }) {
  const { offset, pageSize: size } = pageParams(page, pageSize);
  const db = new MySQL();
  const where = keyword ? 'WHERE car_name LIKE ? OR des LIKE ?' : '';
  const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
  try {
    const rows = await db.query(`SELECT * FROM pp_car ${where} ORDER BY update_time DESC LIMIT ?, ?`, [
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

async function createCar({ car_name, image_url, des, day_price, promotion_day_price }) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'INSERT INTO pp_car (car_name, image_url, des, day_price, promotion_day_price) VALUES (?,?,?,?,?)',
      [car_name, image_url, des || null, day_price, promotion_day_price || null]
    );
    return res.insertId;
  } finally {
    db.close();
  }
}

async function updateCar(id, { car_name, image_url, des, day_price, promotion_day_price }) {
  const db = new MySQL();
  try {
    const res = await db.query(
      'UPDATE pp_car SET car_name = ?, image_url = ?, des = ?, day_price = ?, promotion_day_price = ? WHERE id = ?',
      [car_name, image_url, des || null, day_price, promotion_day_price || null, id]
    );
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

async function getOrderList({ page = 1, pageSize = 10, pay_status, order_status, keyword = '' }) {
  const { offset, pageSize: size } = pageParams(page, pageSize);
  const db = new MySQL();
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
      const [user] = await db.query('SELECT id, phone, nickname, username FROM adp_user WHERE id = ?', [
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

/* ================= 概览统计 ================= */

async function getDashboardStats() {
  const db = new MySQL();
  try {
    const [userTotal] = await db.query('SELECT COUNT(*) AS v FROM adp_user');
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
  deleteCar,
  getOrderList,
  getOrderDetail,
  updateOrderStatus,
  getDashboardStats,
};
