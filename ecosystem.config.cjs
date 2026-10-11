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
