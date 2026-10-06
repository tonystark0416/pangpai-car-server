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
  miniprogram.getAccessToken().then((data) => {
    try {
      fs.writeFileSync(path.join(config.tokenDir, 'wx_access_token.txt'), data);
      console.log('小程序 access_token 已刷新');
    } catch (err) {
      console.error(err);
    }
  });
  work.getWorkWeixinToken().then((data) => {
    try {
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
