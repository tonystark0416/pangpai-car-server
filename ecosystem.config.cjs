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
  ],
};
