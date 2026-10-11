/**
 * 定时刷新小程序/企业微信的 access_token
 * 启动方式：npm run task:token
 */
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const miniprogram = require('../services/wechat/miniprogram');
const work = require('../services/wechat/work');

function refreshAccessToken() {
  // token 目录可能不存在（gitignore 的运行时目录），写入前确保创建
  fs.mkdirSync(config.tokenDir, { recursive: true });
  miniprogram.getAccessToken().then((data) => {
    try {
      fs.writeFileSync(path.join(config.tokenDir, 'wx_access_token.txt'), data);
      console.log('小程序 access_token 已刷新');
    } catch (err) {
      console.error(err);
    }
  }).catch((err) => {
    console.error('小程序 access_token 刷新失败:', err.message);
  });
  work.getWorkWeixinToken().then((data) => {
    try {
      if (!data.token) {
        console.error('企业微信 access_token 获取失败:', JSON.stringify(data));
        return;
      }
      fs.writeFileSync(path.join(config.tokenDir, 'work_access_token.txt'), data.token);
      console.log('企业微信 access_token 已刷新');
    } catch (err) {
      console.error(err);
    }
  });
}

// 启动时先刷新一次
refreshAccessToken();

// 每小时整点刷新
schedule.scheduleJob('0 0 * * * ?', () => {
  refreshAccessToken();
  console.log('scheduleCronstyle:' + new Date());
});
