

/**
 * 定时刷新小程序的access_token
 */

const schedule = require('node-schedule');
const fs = require('fs');
const token = require('../base/weixin-api.js')
const workToken = require('../base/work.weixin.api.js')

function refreshAccessToken() {
    token.getAccessToken().then((data) => {
        console.log(data)
        // 同步方式
        try {
            fs.writeFileSync('/www/wwwroot/mikeapp/src/file/wx_access_token.txt', data);
            console.log('文件已清空并写入新内容');
        } catch (err) {
            console.error(err);
        }
    })
    workToken.getWorkWeixinToken().then((data) => {
        console.log(data)
        // 同步方式
        try {
            fs.writeFileSync('/www/wwwroot/mikeapp/src/file/work_access_token.txt', data.token);
            console.log('企业微信token文件已清空并写入新内容');
        } catch (err) {
            console.error(err);
        }
    })
}




const scheduleCronstyle = () => {
    schedule.scheduleJob('0 0 * * * ?', () => {
        refreshAccessToken()
        console.log('scheduleCronstyle:' + new Date())
    })
}

scheduleCronstyle()