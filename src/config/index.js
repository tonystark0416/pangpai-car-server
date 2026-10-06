/**
 * 统一配置中心：所有配置从 .env 环境变量加载
 * 好处：密钥与代码分离，.env 不入库，通过 .env.example 提供模板
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const ROOT = path.resolve(__dirname, '../..');

const env = (key, defaultValue = '') => process.env[key] || defaultValue;

/** 相对路径自动基于项目根目录解析为绝对路径 */
const resolveDir = (dir, defaultDir) => {
  const target = dir || defaultDir;
  return path.isAbsolute(target) ? target : path.join(ROOT, target);
};

const config = {
  root: ROOT,
  port: parseInt(env('PORT', '3002'), 10),

  /** MySQL 连接 */
  mysql: {
    host: env('DB_HOST', 'localhost'),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD'),
    database: env('DB_NAME'),
    charset: env('DB_CHARSET', 'UTF8_GENERAL_CI'),
    connectTimeout: 10000,
    multipleStatements: false,
  },

  /** 微信小程序 */
  wx: {
    appid: env('WX_APPID'),
    secret: env('WX_SECRET'),
  },

  /** 微信支付 V2 */
  wxPay: {
    appid: env('WX_APPID'),
    mchId: env('WX_MCH_ID'),
    apiKey: env('WX_API_KEY'),
    notifyUrl: env('WX_NOTIFY_URL'),
    refundNotifyUrl: env('WX_REFUND_NOTIFY_URL'),
    spbillCreateIp: env('PAY_SPBILL_IP', '127.0.0.1'),
    pfxPath: env('WX_PFX_PATH') || path.join(ROOT, 'src/data/apiclient_cert.p12'),
    // 惰性读取证书，未配置证书时不阻断服务启动
    get pfx() {
      if (fs.existsSync(this.pfxPath)) {
        return fs.readFileSync(this.pfxPath);
      }
      console.warn('[config] 未找到微信支付证书:', this.pfxPath);
      return null;
    },
  },

  /** 企业微信 */
  workWx: {
    corpid: env('WORK_CORPID'),
    corpsecret: env('WORK_CORPSECRET'),
    notifyUserid: env('WORK_NOTIFY_USERID', 'LiuWeiZhao'),
    miniprogramPage: env('WORK_MINIPROGRAM_PAGE', 'pages/orderList/orderList'),
  },

  /** 文件上传 / 静态图片 / token 缓存 */
  upload: {
    dir: resolveDir(env('UPLOAD_DIR'), 'uploads'),
    baseUrl: env('IMAGE_BASE_URL'),
  },
  tokenDir: resolveDir(env('TOKEN_DIR'), 'src/data'),
};

module.exports = config;
