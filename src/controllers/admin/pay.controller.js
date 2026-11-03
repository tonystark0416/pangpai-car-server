/**
 * 管理后台：支付流水（v1.7.9）
 *
 * 目标：运营不用登录微信支付后台，就能在自家后台看到任意一笔支付/退款的明细。
 *
 * 设计原则：**本地库为主，微信侧只作核对源**。
 *   列表/详情直接读 `pp_pay_record`（秒开、可筛选、可分页），
 *   只有在人点「同步微信状态」时才调微信接口——既避免限频，也不会因为微信抖动导致页面打不开。
 */
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const payModel = require('../../models/pay.model');
const orderModel = require('../../models/order.model');
const reconcileModel = require('../../models/reconcile.model');
const reconcileService = require('../../services/reconcile.service');
const WechatPayV2 = require('../../services/wechat/pay');
const config = require('../../config');

const wechatPay = new WechatPayV2(config.wxPay);

/**
 * 流水列表
 * GET /pay-records?page=&pageSize=&record_type=&status=&keyword=&start=&end=&orderSn=
 */
async function list(req, res) {
  const { page, pageSize, record_type, status, keyword, start, end, orderSn } = req.query;
  const data = await payModel.listPayRecords({
    page,
    pageSize,
    record_type,
    status,
    keyword,
    start,
    end,
    orderSn,
  });
  res.json({ code: 0, msg: 'success', data });
}

/** 单条详情（含微信原始返回 raw，便于核对） */
async function detail(req, res) {
  const row = await payModel.getPayRecordById(req.params.id);
  if (!row) return res.json({ code: 404, msg: '流水不存在' });
  res.json({ code: 0, msg: 'success', data: row });
}

/**
 * 手动同步单条流水状态（v1.7.9 关键能力）
 * POST /pay-records/:id/sync
 *
 * 支付流水 → 调 /pay/orderquery；退款流水 → 调 /pay/refundquery。
 * 拿回来的最新结果写回流表（source=manual），并把微信原文存进 raw。
 *
 * 说明：**只更新流水，不改订单状态**——订单状态的归属是回调与查单兜底，
 * 后台同步属于「查看」性质，越权改订单会让两条口径打架。
 */
async function sync(req, res) {
  const row = await payModel.getPayRecordById(req.params.id);
  if (!row) return res.json({ code: 404, msg: '流水不存在' });

  const order = await orderModel.getOrderBySn(row.order_sn);
  try {
    let wx;
    let rec;
    if (Number(row.record_type) === payModel.RECORD_TYPE.REFUND) {
      // 退款：优先用商户退款单号（有则用，没有就用订单号）
      wx = await wechatPay.refundQuery({
        outTradeNo: row.out_trade_no || row.order_sn,
        outRefundNo: row.out_refund_no || undefined,
        refundId: row.refund_id || undefined,
      });
      if (wx.result_code !== 'SUCCESS') {
        return res.json({ code: 400, msg: `微信退款查询失败：${wx.err_code || ''} ${wx.err_code_des || wx.return_msg || ''}`.trim() });
      }
      rec = payModel.buildPayRecordFromRefund(order || { order_sn: row.order_sn }, wx, {
        outRefundNo: row.out_refund_no,
        refundFee: row.amount,
        source: 'manual',
      });
    } else {
      wx = await wechatPay.orderQuery({ outTradeNo: row.out_trade_no || row.order_sn });
      if (wx.result_code !== 'SUCCESS') {
        return res.json({ code: 400, msg: `微信查单失败：${wx.err_code || ''} ${wx.err_code_des || wx.return_msg || ''}`.trim() });
      }
      rec = payModel.buildPayRecordFromPay(order || { order_sn: row.order_sn }, wx, 'manual');
    }

    // 同步不能把唯一键冲掉：沿用本条已有的单号
    rec.out_trade_no = row.out_trade_no || rec.out_trade_no;
    rec.out_refund_no = row.out_refund_no || rec.out_refund_no;

    const r = await payModel.savePayRecord(rec);
    if (r === -1) return res.json({ code: 500, msg: '流水写回失败' });

    const updated = await payModel.getPayRecordById(row.id);
    console.log('[admin-pay] 同步流水:', row.order_sn, '类型', row.record_type, '操作人', req.admin && req.admin.username);
    return res.json({ code: 0, msg: `已同步（${updated.status_text || updated.status || '无状态'}）`, data: updated });
  } catch (error) {
    console.error('[admin-pay] 同步失败:', row.order_sn, error.message);
    return res.json({ code: 500, msg: `同步失败：${error.message}` });
  }
}

/** 某订单的资金流水（订单详情页用） */
async function listByOrder(req, res) {
  const rows = await payModel.listByOrderSn(req.params.orderSn);
  res.json({ code: 0, msg: 'success', data: rows });
}

/**
 * 导出 Excel（与列表同源筛选）
 * GET /pay-records/export?record_type=&status=&keyword=&start=&end=
 */
async function exportRecords(req, res) {
  const { record_type, status, keyword, start, end } = req.query;
  const rows = await payModel.listExport({ record_type, status, keyword, start, end });

  const wb = new ExcelJS.Workbook();
  wb.creator = '庞派汽车管理后台';
  wb.created = new Date();
  const ws = wb.addWorksheet('支付流水');

  ws.columns = [
    { header: '订单号', key: 'order_sn', width: 22 },
    { header: '类型', key: 'record_type_text', width: 8 },
    { header: '金额(元)', key: 'amount', width: 12 },
    { header: '状态', key: 'status_text', width: 14 },
    { header: '微信支付单号', key: 'transaction_id', width: 30 },
    { header: '商户退款单号', key: 'out_refund_no', width: 24 },
    { header: '微信退款单号', key: 'refund_id', width: 26 },
    { header: '付款银行', key: 'bank_type', width: 12 },
    { header: '到账', key: 'fund_change_text', width: 10 },
    { header: '微信时间', key: 'trade_time_text', width: 20 },
    { header: '用户ID', key: 'uid', width: 10 },
    { header: '用户', key: 'nickname', width: 16 },
    { header: '手机号', key: 'phone', width: 14 },
    { header: '来源', key: 'source_text', width: 12 },
    { header: '记录时间', key: 'create_time_text', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const fmtTime = (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '');
  rows.forEach((r) => {
    ws.addRow({
      order_sn: r.order_sn,
      record_type_text: r.record_type_text,
      amount: Number(r.amount),
      status_text: r.status_text || r.status || '-',
      transaction_id: r.transaction_id || '-',
      out_refund_no: r.out_refund_no || '-',
      refund_id: r.refund_id || '-',
      bank_type: r.bank_type || '-',
      fund_change_text: r.fund_change === 'Y' ? '即时到账' : r.fund_change === 'N' ? '银行卡异步' : '-',
      trade_time_text: fmtTime(r.trade_time),
      uid: r.uid ?? '-',
      nickname: r.nickname || '-',
      phone: r.phone || '-',
      source_text: r.source_text || '-',
      create_time_text: fmtTime(r.create_time),
    });
  });

  const filename = `支付流水_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await wb.xlsx.write(res);
  res.end();
}

// ─── 每日对账（v1.7.11）──────────────────────────────────────────

/**
 * 对账结果列表（含差异明细）
 * GET /reconcile?page=&pageSize=
 */
async function reconcileList(req, res) {
  const { page, pageSize } = req.query;
  const data = await reconcileModel.listResults({ page, pageSize });
  res.json({ code: 0, msg: 'success', data });
}

/**
 * 手动对账某一天（微信账单 T+1 生成，只能对已生成的历史日期）
 * POST /reconcile/run  body: { date: 'YYYY-MM-DD' }
 * 注意：会真实调微信下载账单，并可能自动补录漏掉的流水
 */
async function reconcileRun(req, res) {
  const { date } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return res.json({ code: 400, msg: '日期格式应为 YYYY-MM-DD' });
  }
  // 账单 T+1：当天及未来的日期直接拒绝，避免运营误操作
  const today = dayjs().format('YYYY-MM-DD');
  if (String(date) >= today) {
    return res.json({ code: 400, msg: '账单 T+1 生成，只能对账今天之前的日期' });
  }
  const data = await reconcileService.reconcileDate(date);
  res.json({ code: 0, msg: data.message, data });
}

module.exports = { list, detail, sync, listByOrder, exportRecords, reconcileList, reconcileRun };
