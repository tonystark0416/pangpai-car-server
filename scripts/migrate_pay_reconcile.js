/**
 * v1.7.11 每日对账：pp_pay_reconcile 结果表（幂等，可重复执行）
 *
 * 对账结果按天一行：微信账单笔数/金额 vs 本地流水笔数/金额 + 差异明细(JSON)。
 * 重复执行只会建表/补列，不动已有数据。
 *
 * 用法：node scripts/migrate_pay_reconcile.js
 */
const MySQL = require('../src/utils/mysql');

const TABLE = 'pp_pay_reconcile';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_date DATE NOT NULL COMMENT '对账日期（微信账单日期，按记账时间归属）',
  status TINYINT NOT NULL DEFAULT 0 COMMENT '0对账中 1完全一致 2有差异 3对账失败',
  wx_pay_count INT NOT NULL DEFAULT 0 COMMENT '微信账单支付笔数',
  wx_refund_count INT NOT NULL DEFAULT 0 COMMENT '微信账单退款笔数',
  wx_pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '微信账单支付总额',
  wx_refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '微信账单退款总额',
  local_pay_count INT NOT NULL DEFAULT 0 COMMENT '本地支付流水笔数',
  local_refund_count INT NOT NULL DEFAULT 0 COMMENT '本地退款流水笔数',
  diff_count INT NOT NULL DEFAULT 0 COMMENT '差异数',
  fixed_count INT NOT NULL DEFAULT 0 COMMENT '已自动补录流水数',
  diff_detail JSON COMMENT '差异明细 [{type,order_sn,...}]',
  summary JSON COMMENT '微信账单汇总（总笔数/总金额/退款/手续费）',
  message VARCHAR(500) DEFAULT NULL COMMENT '对账说明（失败原因等）',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_bill_date (bill_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日对账结果（微信账单 vs 本地支付流水）'
`;

async function main() {
  const db = new MySQL();
  try {
    console.log(`== 1. 建表 ${TABLE}（幂等）==`);
    await db.query(CREATE_TABLE_SQL);
    console.log('✔ 表已就绪');
    console.log('\n✔ 迁移完成（对账结果表，无需回填——对账按天生成）');
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error('迁移失败：', e.message);
  process.exit(1);
});
