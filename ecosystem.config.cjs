/**
 * PM2 进程配置（与服务器 /www/server/nodejs/vhost/pm2_configs/pangpaicar/ 保持一致后入库）
 * 启动：pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'pangpaicar',
      script: './app.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
    {
      // 支付查单兜底（v1.7.8，启动即跑一轮 + 每 2 分钟一轮）
      // 回调丢失时靠它把「钱付了但订单还待支付」的订单补上，是资金安全的第二道保险
      name: 'pangpai-paycheck',
      script: './src/tasks/checkPendingPayments.js',
      cwd: __dirname,
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/paycheck-out.log',
      error_file: './logs/paycheck-error.log',
      merge_logs: true,
      time: true,
    },
    {
      // 每日对账（v1.7.11，每天 09:30 跑前一天的账单核对）
      // 微信账单 T+1 生成（凌晨可能仍 Bill Creating），所以定在 09:30；
      // 跑完即退出（autorestart:false），到点由 cron_restart 拉起
      name: 'pangpai-reconcile',
      script: './src/tasks/dailyReconcile.js',
      cwd: __dirname,
      autorestart: false,
      cron_restart: '0 30 9 * * *',
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/reconcile-out.log',
      error_file: './logs/reconcile-error.log',
      merge_logs: true,
      time: true,
    },
    {
      // access_token 定时刷新任务（启动即刷一次 + 每小时整点）
      // v1.6.5 起纳入 PM2 托管，避免终端临时进程退出后 token 过期
      name: 'pangpai-token',
      script: './src/tasks/refreshAccessToken.js',
      cwd: __dirname,
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/token-out.log',
      error_file: './logs/token-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
