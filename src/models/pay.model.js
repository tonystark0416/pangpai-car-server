/**
 * 支付流水模型（v1.7.9）
 *
 * 一张表 `pp_pay_record` 同时记录**支付与退款**，用 `record_type` 区分。
 * 设计要点：
 *   1. **流水只追加**：靠唯一键 `(record_type, out_trade_no)` 与 `out_refund_no` 做幂等 upsert，
 *      微信重复回调、后台重复点「同步」都不会产生重复行；
 *   2. **微信原始返回存 `raw`**：出问题时能翻原文核对，将来加展示字段不必改表；
 *   3. **`source` 标记来源**：callback（回调）/ check（查单兜底）/ manual（后台手动同步）/ refund（退款），
 *      一眼能看出这笔流水是怎么来的——排查「回调丢了没」时尤其有用。
 */
const MySQL = require('../utils/mysql');

/** 流水类型 */
const RECORD_TYPE = { PAY: 1, REFUND: 2 };
const RECORD_TYPE_TEXT = { 1: '支付', 2: '退款' };

/** 微信支付状态（trade_state）→ 中文 */
const PAY_STATUS_TEXT = {
  SUCCESS: '支付成功',
  REFUND: '转入退款',
  NOTPAY: '未支付',
  CLOSED: '已关闭',
  REVOKED: '已撤销（刷卡支付）',
  USERPAYING: '用户支付中',
  PAYERROR: '支付失败',
};

/** 微信退款状态（refund_status）→ 中文 */
const REFUND_STATUS_TEXT = {
  SUCCESS: '退款成功',
  REFUNDREC: '退款已接收',
  PROCESSING: '退款处理中',
  CHANGE: '退款异常',
  FAIL: '退款失败',
};

/** 来源 → 中文 */
const SOURCE_TEXT = {
  callback: '支付回调',
  check: '查单兜底',
  manual: '后台同步',
  refund: '退款',
  backfill: '历史回填',
  reconcile: '每日对账补录',
};

/**
 * 各种时间格式 → MySQL datetime 字符串
 * 支持：微信 time_end（20261102120000）、退款成功时间（2026-11-02 12:00:00 / ISO）、Date
 */
function toMysqlDatetime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  const s = String(v).trim();
  // 微信 time_end：YYYYMMDDHHmmss（14 位纯数字）
  if (/^\d{14}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
  }
  const iso = s.replace('T', ' ').replace(/\+.*$/, '').trim();
  return iso.slice(0, 19);
}

/**
 * 取退款字段：微信 V2 退款查询对单笔退款返回 `xxx_0` 形式，个别情况返回不带后缀
 * 例：refund_status_0 / refund_id_0 / refund_fee_0 / refund_recv_accout_0
 */
function pickRefund(wx, name) {
  if (!wx) return null;
  return wx[`${name}_0`] !== undefined ? wx[`${name}_0`] : wx[name];
}

/**
 * 由「支付查单 / 支付回调」的结果构造流水行
 * @param {object} order 订单（至少含 order_sn、uid、pay_amount/total_price）
 * @param {object} wx 微信 orderquery / 回调返回
 * @param {string} source callback / check / manual / backfill
 */
function buildPayRecordFromPay(order, wx, source = 'callback') {
  const status = wx.trade_state || (wx.result_code === 'SUCCESS' ? 'SUCCESS' : null);
  const amount = wx.total_fee != null ? Number(wx.total_fee) / 100 : Number(order?.pay_amount ?? order?.total_price ?? 0);
  return {
    record_type: RECORD_TYPE.PAY,
    order_sn: order?.order_sn || wx.out_trade_no,
    uid: order?.uid ?? null,
    out_trade_no: wx.out_trade_no || order?.order_sn,
    out_refund_no: null,
    transaction_id: wx.transaction_id || null,
    refund_id: null,
    amount,
    status,
    status_text: PAY_STATUS_TEXT[status] || status || null,
    bank_type: wx.bank_type || null,
    fund_change: null,
    trade_time: toMysqlDatetime(wx.time_end),
    source,
    raw: wx,
  };
}

/**
 * 由「退款结果 / 退款查询」构造流水行
 * @param {object} order 订单
 * @param {object} wx 微信 refund / refundquery 返回
 * @param {object} [opt]
 * @param {string} [opt.outRefundNo] 商户退款单号（退款查询不一定回传，需补上）
 * @param {number} [opt.refundFee] 退款金额（元），微信未返回时用
 * @param {string} [opt.source]
 */
function buildPayRecordFromRefund(order, wx, opt = {}) {
  const status = pickRefund(wx, 'refund_status') || wx.refund_status || (wx.result_code === 'SUCCESS' ? 'SUCCESS' : null);
  const fee = pickRefund(wx, 'refund_fee');
  const amount = fee != null ? Number(fee) / 100 : Number(opt.refundFee ?? order?.pay_amount ?? 0);
  const successTime = pickRefund(wx, 'refund_success_time');
  return {
    record_type: RECORD_TYPE.REFUND,
    order_sn: order?.order_sn || wx.out_trade_no,
    uid: order?.uid ?? null,
    out_trade_no: wx.out_trade_no || order?.order_sn,
    out_refund_no: opt.outRefundNo || pickRefund(wx, 'out_refund_no') || null,
    transaction_id: wx.transaction_id || order?.transaction_id || null,
    refund_id: pickRefund(wx, 'refund_id') || wx.refund_id || null,
    amount,
    status,
    status_text: REFUND_STATUS_TEXT[status] || status || null,
    bank_type: null,
    // fund_change：Y 即时到账（零钱），N 非即时（银行卡，异步到账）
    fund_change: pickRefund(wx, 'refund_recv_accout') ? (String(pickRefund(wx, 'refund_recv_accout')).includes('银行') ? 'N' : 'Y') : null,
    trade_time: toMysqlDatetime(successTime),
    source: opt.source || 'refund',
    raw: wx,
  };
}

/**
 * 写入（幂等 upsert）一条流水
 * 唯一键命中时更新明细但**不改** out_refund_no（它本身就是键的一部分）
 * @returns {Promise<number>} 1=新增，2=更新，0=无变化
 */
async function savePayRecord(p) {
  const db = new MySQL();
  const sql = `INSERT INTO pp_pay_record
      (record_type, order_sn, uid, out_trade_no, out_refund_no, transaction_id, refund_id,
       amount, status, status_text, bank_type, fund_change, trade_time, source, raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      order_sn = VALUES(order_sn),
      uid = VALUES(uid),
      transaction_id = VALUES(transaction_id),
      refund_id = VALUES(refund_id),
      amount = VALUES(amount),
      status = VALUES(status),
      status_text = VALUES(status_text),
      bank_type = VALUES(bank_type),
      fund_change = VALUES(fund_change),
      trade_time = VALUES(trade_time),
      source = VALUES(source),
      raw = VALUES(raw)`;
  const params = [
    p.record_type,
    p.order_sn || null,
    p.uid ?? null,
    p.out_trade_no || null,
    p.out_refund_no || null,
    p.transaction_id || null,
    p.refund_id || null,
    Number(p.amount) || 0,
    p.status || null,
    p.status_text || null,
    p.bank_type || null,
    p.fund_change || null,
    p.trade_time || null,
    p.source || null,
    p.raw ? JSON.stringify(p.raw) : null,
  ];
  try {
    const res = await db.query(sql, params);
    // mysql2：insertId 非 0 为新增；affectedRows=1 新增，2 更新，0 无变化
    if (res.affectedRows === 1) return 1;
    if (res.affectedRows === 2) return 2;
    return 0;
  } catch (error) {
    console.error('[pay-record] savePayRecord error:', error.message);
    return -1;
  } finally {
    db.close();
  }
}

/** 带中文展示字段的装饰 */
function decorate(row) {
  if (!row) return row;
  return {
    ...row,
    record_type: Number(row.record_type),
    record_type_text: RECORD_TYPE_TEXT[Number(row.record_type)] || '',
    amount: Number(row.amount),
    source_text: SOURCE_TEXT[row.source] || row.source || '',
    raw: typeof row.raw === 'string' ? safeJson(row.raw) : row.raw,
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * 流水列表（后台）
 * @param {object} q {page,pageSize,record_type,status,keyword,start,end,orderSn,uid}
 */
async function listPayRecords(q = {}) {
  const db = new MySQL();
  const page = Number(q.page) || 1;
  const pageSize = Number(q.pageSize) || 20;
  const where = ['1=1'];
  const params = [];

  if (q.record_type !== undefined && q.record_type !== null && q.record_type !== '') {
    where.push('r.record_type = ?');
    params.push(Number(q.record_type));
  }
  if (q.status) {
    where.push('r.status = ?');
    params.push(String(q.status));
  }
  if (q.orderSn) {
    where.push('r.order_sn = ?');
    params.push(String(q.orderSn));
  }
  if (q.uid) {
    where.push('r.uid = ?');
    params.push(Number(q.uid));
  }
  if (q.start) {
    where.push('COALESCE(r.trade_time, r.create_time) >= ?');
    params.push(String(q.start));
  }
  if (q.end) {
    where.push('COALESCE(r.trade_time, r.create_time) <= ?');
    params.push(String(q.end));
  }
  const kw = String(q.keyword || '').trim();
  if (kw) {
    where.push('(r.order_sn LIKE ? OR r.out_trade_no LIKE ? OR r.out_refund_no LIKE ? OR r.transaction_id LIKE ? OR r.refund_id LIKE ? OR p.phone LIKE ? OR p.nickname LIKE ?)');
    const like = `%${kw}%`;
    params.push(like, like, like, like, like, like, like);
  }

  const whereSql = where.join(' AND ');
  const offset = (page - 1) * pageSize;
  try {
    const [cnt] = await db.query(
      `SELECT COUNT(*) AS total,
              -- 收款：支付流水里确实收过钱的（SUCCESS 支付成功 / REFUND 转入退款＝曾收过款后来退了）
              IFNULL(SUM(CASE WHEN r.record_type = 1 AND r.status IN ('SUCCESS','REFUND') THEN r.amount ELSE 0 END), 0) AS pay_amount,
              IFNULL(SUM(CASE WHEN r.record_type = 2 AND r.status = 'SUCCESS' THEN r.amount ELSE 0 END), 0) AS refund_amount,
              IFNULL(SUM(CASE WHEN r.record_type = 1 THEN 1 ELSE 0 END), 0) AS pay_count,
              IFNULL(SUM(CASE WHEN r.record_type = 2 THEN 1 ELSE 0 END), 0) AS refund_count
       FROM pp_pay_record r LEFT JOIN pp_user p ON p.id = r.uid
       WHERE ${whereSql}`,
      params
    );
    const rows = await db.query(
      `SELECT r.*, p.nickname, p.phone
       FROM pp_pay_record r LEFT JOIN pp_user p ON p.id = r.uid
       WHERE ${whereSql}
       ORDER BY COALESCE(r.trade_time, r.create_time) DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return {
      list: rows.map(decorate),
      total: Number(cnt.total) || 0,
      page,
      pageSize,
      summary: {
        payCount: Number(cnt.pay_count) || 0,
        payAmount: Number(cnt.pay_amount) || 0,
        refundCount: Number(cnt.refund_count) || 0,
        refundAmount: Number(cnt.refund_amount) || 0,
        // 净收入 = 收款 - 退款（负数说明退得比收的多，属异常，需要人工核对）
        netAmount: (Number(cnt.pay_amount) || 0) - (Number(cnt.refund_amount) || 0),
      },
    };
  } catch (error) {
    console.error('[pay-record] listPayRecords error:', error.message);
    return { list: [], total: 0, page, pageSize, summary: { payCount: 0, payAmount: 0, refundCount: 0, refundAmount: 0, netAmount: 0 } };
  } finally {
    db.close();
  }
}

/** 单条详情 */
async function getPayRecordById(id) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      `SELECT r.*, p.nickname, p.phone FROM pp_pay_record r LEFT JOIN pp_user p ON p.id = r.uid WHERE r.id = ?`,
      [Number(id)]
    );
    return decorate(rows[0]);
  } catch (error) {
    console.error('[pay-record] getPayRecordById error:', error.message);
    return null;
  } finally {
    db.close();
  }
}

/** 某订单的全部资金流水（支付 + 退款，按时间正序） */
async function listByOrderSn(orderSn) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      `SELECT r.* FROM pp_pay_record r WHERE r.order_sn = ? ORDER BY COALESCE(r.trade_time, r.create_time) ASC, r.id ASC`,
      [String(orderSn)]
    );
    return rows.map(decorate);
  } catch (error) {
    console.error('[pay-record] listByOrderSn error:', error.message);
    return [];
  } finally {
    db.close();
  }
}

/** 导出（同筛选条件，上限 20000 条） */
async function listExport(q = {}) {
  const db = new MySQL();
  const where = ['1=1'];
  const params = [];
  if (q.record_type !== undefined && q.record_type !== null && q.record_type !== '') {
    where.push('r.record_type = ?');
    params.push(Number(q.record_type));
  }
  if (q.status) {
    where.push('r.status = ?');
    params.push(String(q.status));
  }
  if (q.start) {
    where.push('COALESCE(r.trade_time, r.create_time) >= ?');
    params.push(String(q.start));
  }
  if (q.end) {
    where.push('COALESCE(r.trade_time, r.create_time) <= ?');
    params.push(String(q.end));
  }
  const kw = String(q.keyword || '').trim();
  if (kw) {
    where.push('(r.order_sn LIKE ? OR r.transaction_id LIKE ? OR r.out_refund_no LIKE ?)');
    const like = `%${kw}%`;
    params.push(like, like, like);
  }
  try {
    const rows = await db.query(
      `SELECT r.*, p.nickname, p.phone
       FROM pp_pay_record r LEFT JOIN pp_user p ON p.id = r.uid
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(r.trade_time, r.create_time) DESC, r.id DESC
       LIMIT 20000`,
      params
    );
    return rows.map(decorate);
  } catch (error) {
    console.error('[pay-record] listExport error:', error.message);
    return [];
  } finally {
    db.close();
  }
}

/**
 * 某一天的本地流水（v1.7.11，每日对账用）
 * 按 trade_time（微信侧时间）归属日期——与微信账单「记账时间」同口径
 * @param {string} date 'YYYY-MM-DD'
 * @returns {Promise<Array>} 原始行（含 out_trade_no / out_refund_no / amount / record_type）
 */
async function listByTradeDate(date) {
  const db = new MySQL();
  try {
    const rows = await db.query(
      `SELECT r.id, r.record_type, r.order_sn, r.out_trade_no, r.out_refund_no,
              r.amount, r.status, r.source, r.trade_time
       FROM pp_pay_record r
       WHERE r.trade_time >= ? AND r.trade_time < DATE_ADD(?, INTERVAL 1 DAY)`,
      [`${date} 00:00:00`, `${date} 00:00:00`]
    );
    return rows || [];
  } catch (error) {
    console.error('[pay-record] listByTradeDate error:', error.message);
    return [];
  } finally {
    db.close();
  }
}

module.exports = {
  RECORD_TYPE,
  RECORD_TYPE_TEXT,
  PAY_STATUS_TEXT,
  REFUND_STATUS_TEXT,
  SOURCE_TEXT,
  toMysqlDatetime,
  pickRefund,
  buildPayRecordFromPay,
  buildPayRecordFromRefund,
  savePayRecord,
  listPayRecords,
  getPayRecordById,
  listByOrderSn,
  listExport,
  listByTradeDate,
};
