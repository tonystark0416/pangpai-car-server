// 示例配置：复制本文件为 wx_api_config.js 并填入真实值
const fs = require('fs');

const wx_api_config = {
  appid: 'your_mini_program_appid',
  secret: 'your_mini_program_secret',
  mchId: 'your_mch_id', // 微信支付商户号

  corpid: 'your_work_weixin_corpid',       // 企业微信
  corpsecret: 'your_work_weixin_corpsecret',

  // 接口配置
  notifyUrl: 'https://pangpai-car.com/wxPayCallback', // 支付回调地址
  refundNotifyUrl: '', // 退款回调地址

  // 证书配置（apiclient_cert.p12 微信支付证书，用于退款等需双向认证的接口）
  pfx: fs.readFileSync('/path/to/apiclient_cert.p12'),
  apiKey: 'your_api_v2_key', // APIv2 密钥（32 位）
};

module.exports = wx_api_config;
