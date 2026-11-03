/**
 * 每日对账服务（v1.7.11）
 *
 * 数据源：微信 /pay/downloadbill（资金真源）vs 本地 pp_pay_record 流水。
 * 对账按「微信账单记账时间」归属日期，本地流水按 trade_time（同是微信侧时间）同口径比对。
 *
 * 能自动修的自动修，不能自动修的告警：
 *   - 微信有、本地无流水 → 自动补录（source=reconcile），流水只是记录，补了无害；
 *   - 微信已退款但订单 pay_status 未标记 → 只告警不改，改订单状态必须人工确认；
 *   - 金额不一致 / 本地有微信无 → 只告警，人工核对。
 */
const WechatPayV2 = require('./wechat/pay');
const config = require('../config');
const payModel = require('../models/pay.model');
const orderModel = require('../models/order.model');
const reconcileModel = require('../models/reconcile.model');
const work = require('./wechat/work');

const wechatPay = new WechatPayV2(config.wxPay);

/** 差异类型 → 中文（后台展示用） */
const DIFF_TYPE_TEXT = {
  wx_only_pay: '微信有支付、本地无流水',
  wx_only_refund: '微信有退款、本地无流水',
  local_only_pay: '本地有支付流水、微信账单无此笔',
  local_only_refund: '本地有退款流水、微信账单无此笔',
  amount_mismatch: '金额不一致',
  order_status_issue: '订单状态待人工确认',
  order_missing: '微信有交易但本地无此订单',
};

/**
 * 对账某一天
 * @param {string} date 'YYYY-MM-DD'（微信账单日期，兼容 YYYYMMDD）
 * @param {object} [opt]
 * @param {boolean} [opt.notify=true] 有差异时是否发企微通知
 * @returns {Promise<object>} 对账结果（与落库内容一致）
 */
async function reconcileDate(date, opt = {}) {
  const billDate = String(date).slice(0, 10);
  const notify = opt.notify !== false;

  console.log('[reconcile] 开始对账 ' + billDate);

  let rows, summary, wxError;
  try {
    const raw = await wechatPay.downloadBill({ billDate: billDate.replace(/-/g, '') });
    const parsed = await wechatPay.parseBill(raw);
    rows = parsed.rows;
    summary = parsed.summary;
    wxError = parsed.error;
  } catch (e) {
    wxError = { return_code: 'FAIL', return_msg: e.message };
  }

  // 微信侧拿不到账单（无账单 / Bill Creating / 网络失败）→ 记失败，可重跑
  if (wxError) {
    const message = ('微信账单获取失败：' + (wxError.error_code || '') + ' ' + (wxError.return_msg || '')).trim();
    console.log('[reconcile] ' + billDate + ' ' + message);
    const failed = {
      bill_date: billDate, status: reconcileModel.STATUS.FAILED,
      wx_pay_count: 0, wx_refund_count: 0, wx_pay_amount: 0, wx_refund_amount: 0,
      local_pay_count: 0, local_refund_count: 0, diff_count: 0, fixed_count: 0,
      diff_detail: { items: [] }, summary: null, message,
    };
    await reconcileModel.saveResult(failed);
    return failed;
  }

  // 账单行分类（ALL 账单里支付行与退款行混在一起，靠交易状态区分）
  const wxPays = rows.filter((r) => r['交易状态'] === 'SUCCESS');
  const wxRefunds = rows.filter((r) => r['交易状态'] === 'REFUND');
  const num = (s) => (s === '' || s == null ? 0 : Number(s));

  // 本地流水按匹配键建索引；匹配上的从 map 删除，剩下的就是「本地有微信无」
  const locals = await payModel.listByTradeDate(billDate);
  const localPayMap = new Map(locals.filter((r) => Number(r.record_type) === 1).map((r) => [r.out_trade_no, r]));
  const localRefundMap = new Map(locals.filter((r) => Number(r.record_type) === 2).map((r) => [r.out_refund_no, r]));

  const issues = [];
  let fixed = 0;

  // 由账单行伪造「微信查询返回」，复用 buildPayRecord* 构造逻辑，
  // 保证对账补录的流水与回调/查单补的流水字段口径完全一致
  const wxFromBillPay = (r) => ({
    result_code: 'SUCCESS',
    trade_state: 'SUCCESS',
    total_fee: String(Math.round(num(r['订单金额']) * 100)),
    transaction_id: r['微信订单号'],
    out_trade_no: r['商户订单号'],
    time_end: r['交易时间'],
    bank_type: r['付款银行'],
  });
  const wxFromBillRefund = (r) => ({
    result_code: 'SUCCESS',
    out_refund_no_0: r['商户退款单号'],
    refund_id_0: r['微信退款单号'],
    refund_fee_0: String(Math.round(num(r['退款金额']) * 100)),
    refund_status_0: r['退款状态'] || 'SUCCESS',
    refund_success_time_0: r['交易时间'],
  });

  // ── 1) 微信支付行 ──────────────────────────────────────────────
  for (const r of wxPays) {
    const sn = r['商户订单号'];
    const amt = num(r['订单金额']);
    const local = localPayMap.get(sn);
    if (local) {
      if (Number(local.amount) !== amt) {
        issues.push({ type: 'amount_mismatch', order_sn: sn, msg: '支付金额不一致：微信 ' + amt + ' 元 / 本地 ' + Number(local.amount) + ' 元' });
      }
      localPayMap.delete(sn);
      continue;
    }
    // 微信有支付、本地无流水 → 自动补录
    const order = await orderModel.getOrderBySn(sn);
    if (!order) {
      issues.push({ type: 'order_missing', order_sn: sn, msg: '微信有支付（' + amt + ' 元）但本地无此订单，需人工核对' });
      continue;
    }
    try {
      await payModel.savePayRecord(payModel.buildPayRecordFromPay(order, wxFromBillPay(r), 'reconcile'));
      fixed += 1;
      issues.push({ type: 'wx_only_pay', order_sn: sn, wx_amount: amt, fixed: true, msg: '微信有支付、本地无流水，已自动补录（' + amt + ' 元）' });
      // 顺手核对订单状态：微信已收款但订单未落库
      if (Number(order.pay_status) === 0) {
        issues.push({ type: 'order_status_issue', order_sn: sn, msg: '微信已收款，订单仍是「未支付」——查单兜底任务会自动补单，请稍后确认' });
      }
    } catch (e) {
      issues.push({ type: 'wx_only_pay', order_sn: sn, wx_amount: amt, fixed: false, msg: '微信有支付、本地无流水，且自动补录失败：' + e.message });
    }
  }
  for (const [sn] of localPayMap) {
    issues.push({ type: 'local_only_pay', order_sn: sn, msg: '本地有支付流水、微信账单无此笔，需人工核对' });
  }

  // ── 2) 微信退款行 ─────────────────────────────────────────────
  for (const r of wxRefunds) {
    const sn = r['商户订单号'];
    const refundNo = r['商户退款单号'];
    const amt = num(r['退款金额']);
    const local = localRefundMap.get(refundNo);
    if (local) {
      if (Number(local.amount) !== amt) {
        issues.push({ type: 'amount_mismatch', order_sn: sn, out_refund_no: refundNo, msg: '退款金额不一致：微信 ' + amt + ' 元 / 本地 ' + Number(local.amount) + ' 元' });
      }
      localRefundMap.delete(refundNo);
      continue;
    }
    // 微信有退款、本地无流水（最常见：商户平台手工退款）→ 自动补录
    const order = await orderModel.getOrderBySn(sn);
    if (!order) {
      issues.push({ type: 'order_missing', order_sn: sn, out_refund_no: refundNo, msg: '微信有退款（' + amt + ' 元）但本地无此订单，需人工核对' });
      continue;
    }
    try {
      await payModel.savePayRecord(payModel.buildPayRecordFromRefund(order, wxFromBillRefund(r), { source: 'reconcile' }));
      fixed += 1;
      issues.push({ type: 'wx_only_refund', order_sn: sn, out_refund_no: refundNo, wx_amount: amt, fixed: true, msg: '微信有退款、本地无流水（常见于商户平台手工退款），已自动补录（' + amt + ' 元）' });
      // 订单状态核对：只告警不改，动钱口径的事必须人工确认
      if (Number(order.pay_status) !== 2) {
        issues.push({ type: 'order_status_issue', order_sn: sn, out_refund_no: refundNo, fixed: false, msg: '微信已退款但订单 pay_status=' + order.pay_status + '（未标记已退款），请人工确认后修正订单状态' });
      }
    } catch (e) {
      issues.push({ type: 'wx_only_refund', order_sn: sn, out_refund_no: refundNo, fixed: false, msg: '微信有退款、本地无流水，且自动补录失败：' + e.message });
    }
  }
  for (const [no] of localRefundMap) {
    issues.push({ type: 'local_only_refund', out_refund_no: no, msg: '本地有退款流水、微信账单无此笔，需人工核对' });
  }

  const result = {
    bill_date: billDate,
    status: issues.length ? reconcileModel.STATUS.DIFF : reconcileModel.STATUS.OK,
    wx_pay_count: wxPays.length,
    wx_refund_count: wxRefunds.length,
    wx_pay_amount: wxPays.reduce((s, r) => s + num(r['订单金额']), 0),
    wx_refund_amount: wxRefunds.reduce((s, r) => s + num(r['退款金额']), 0),
    local_pay_count: locals.filter((r) => Number(r.record_type) === 1).length,
    local_refund_count: locals.filter((r) => Number(r.record_type) === 2).length,
    diff_count: issues.length,
    fixed_count: fixed,
    diff_detail: { items: issues.map((it) => Object.assign({}, it, { type_text: DIFF_TYPE_TEXT[it.type] || it.type })) },
    summary,
    message: issues.length
      ? '发现 ' + issues.length + ' 处差异，已自动补录 ' + fixed + ' 条流水，其余需人工核对'
      : '账单与本地流水完全一致',
  };
  await reconcileModel.saveResult(result);
  console.log('[reconcile] ' + billDate + ' 完成：' + result.message);

  if (issues.length && notify) {
    await notifyDiff(result);
  }
  return result;
}

/** 有差异时发企微通知（小程序通知消息，与补单通知同通道；失败不影响对账结果） */
async function notifyDiff(result) {
  try {
    const first = (result.diff_detail.items || [])[0] || {};
    await work.workSendMsgMiniProgram(
      config.workWx.notifyUserid,
      config.wx.appid,
      config.workWx.miniprogramPage,
      '对账通知',
      result.bill_date + ' 账单核对发现 ' + result.diff_count + ' 处差异',
      [
        { key: '对账日期', value: result.bill_date },
        { key: '差异情况', value: '自动补录 ' + result.fixed_count + ' 条，待人工 ' + (result.diff_count - result.fixed_count) + ' 条' },
        { key: '首条差异', value: (first.order_sn || first.out_refund_no || '-') + '：' + (first.msg || '-') },
      ]
    );
  } catch (e) {
    console.error('[reconcile] 企微通知失败:', e.message);
  }
}

module.exports = { reconcileDate, DIFF_TYPE_TEXT };
