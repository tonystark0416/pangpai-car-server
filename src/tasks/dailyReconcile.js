/**
 * 每日对账任务（v1.7.11）
 *
 * 每天早上跑一次，核对前一天的微信账单与本地支付流水：
 *   - 微信账单 T+1 生成，且凌晨可能仍在生成（Bill Creating），故定在 09:30；
 *   - 对账结果落 pp_pay_reconcile，后台「支付管理 → 每日对账」可查历史；
 *   - 发现「微信有、本地无流水」自动补录；订单状态问题只告警不改；
 *   - 有差异发企微通知。
 *
 * 启动方式：PM2 应用 pangpai-reconcile（ecosystem.config.cjs，cron 每天 09:30）；
 * 手动跑：npm run task:reconcile -- --date 2026-11-03（也可不带参数跑前一天）
 */
const { reconcileDate } = require('../services/reconcile.service');

/** 取 N 天前的 'YYYY-MM-DD'（用服务器本地时区，与微信账单日期口径一致） */
function dateNdaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf('--date');
  // 默认跑前一天：账单 T+1，当天账单要次日才能拿到
  const target = dateIdx >= 0 && args[dateIdx + 1] ? args[dateIdx + 1] : dateNdaysAgo(1);

  console.log('[daily-reconcile] 启动，目标日期:', target);
  try {
    const r = await reconcileDate(target);
    console.log('[daily-reconcile] 完成:', r.message);
    // 有差异也给退出码 0——差异不是任务失败；任务失败（拿不到账单等）由内部记 status=3
    process.exit(0);
  } catch (e) {
    console.error('[daily-reconcile] 任务异常:', e);
    process.exit(1);
  }
}

main();
