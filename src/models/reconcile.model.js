/**
 * 每日对账结果模型（v1.7.11）
 *
 * 表 `pp_pay_reconcile`：一天一行，记录微信账单 vs 本地流水的核对结果。
 * diff_detail(JSON) 存差异明细，summary(JSON) 存微信账单汇总行——
 * 对账结论要能复现，所以两边都留档。
 */
const MySQL = require('../utils/mysql');

/** 对账状态 */
const STATUS = { RUNNING: 0, OK: 1, DIFF: 2, FAILED: 3 };
const STATUS_TEXT = { 0: '对账中', 1: '完全一致', 2: '有差异', 3: '对账失败' };

/**
 * 保存（upsert）某天的对账结果——同一天重复对账覆盖旧结果
 * @param {object} r {bill_date, status, wx_pay_count, ..., diff_detail, summary, message}
 */
async function saveResult(r) {
  const db = new MySQL();
  const sql = `INSERT INTO pp_pay_reconcile
      (bill_date, status, wx_pay_count, wx_refund_count, wx_pay_amount, wx_refund_amount,
       local_pay_count, local_refund_count, diff_count, fixed_count, diff_detail, summary, message)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      wx_pay_count = VALUES(wx_pay_count),
      wx_refund_count = VALUES(wx_refund_count),
      wx_pay_amount = VALUES(wx_pay_amount),
      wx_refund_amount = VALUES(wx_refund_amount),
      local_pay_count = VALUES(local_pay_count),
      local_refund_count = VALUES(local_refund_count),
      diff_count = VALUES(diff_count),
      fixed_count = VALUES(fixed_count),
      diff_detail = VALUES(diff_detail),
      summary = VALUES(summary),
      message = VALUES(message)`;
  try {
    await db.query(sql, [
      r.bill_date, r.status, r.wx_pay_count, r.wx_refund_count, r.wx_pay_amount, r.wx_refund_amount,
      r.local_pay_count, r.local_refund_count, r.diff_count, r.fixed_count,
      JSON.stringify(r.diff_detail || { items: [] }),
      JSON.stringify(r.summary || null),
      r.message || null,
    ]);
    return true;
  } catch (error) {
    console.error('[reconcile] saveResult error:', error.message);
    return false;
  } finally {
    db.close();
  }
}

/**
 * 对账结果列表（分页，新日期在前）
 * diff_detail/summary 已 parse 为对象
 */
async function listResults({ page = 1, pageSize = 10 } = {}) {
  const db = new MySQL();
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));
  try {
    const rows = await db.query(
      `SELECT * FROM pp_pay_reconcile
       ORDER BY bill_date DESC LIMIT ? OFFSET ?`,
      [size, (p - 1) * size]
    );
    const [cnt] = await db.query('SELECT COUNT(*) AS total FROM pp_pay_reconcile');
    return {
      list: (rows || []).map(decorate),
      total: Number(cnt.total) || 0,
      page: p,
      pageSize: size,
    };
  } catch (error) {
    console.error('[reconcile] listResults error:', error.message);
    return { list: [], total: 0, page: p, pageSize: size };
  } finally {
    db.close();
  }
}

/** 某天的对账结果 */
async function getByDate(billDate) {
  const db = new MySQL();
  try {
    const rows = await db.query('SELECT * FROM pp_pay_reconcile WHERE bill_date = ?', [billDate]);
    return rows && rows[0] ? decorate(rows[0]) : null;
  } catch (error) {
    console.error('[reconcile] getByDate error:', error.message);
    return null;
  } finally {
    db.close();
  }
}

function decorate(row) {
  return {
    ...row,
    status: Number(row.status),
    status_text: STATUS_TEXT[Number(row.status)] || String(row.status),
    diff_detail: safeJson(row.diff_detail, { items: [] }),
    summary: safeJson(row.summary, null),
  };
}

function safeJson(v, def) {
  if (v === null || v === undefined || v === '') return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
}

module.exports = { STATUS, STATUS_TEXT, saveResult, listResults, getByDate };
