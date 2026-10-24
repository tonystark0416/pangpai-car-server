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

  /**
   * 业务标识：auth 表的 biz_code
   * v1.6.15：用户体系已拆分到 pp_user / pp_user_auth（原 adp_user 留给其他项目），
   * 本字段保留用于区分同一用户在不同小程序下的授权行
   */
  biz: {
    code: env('BIZ_CODE', 'pp'),
  },

  /** 管理后台 JWT */
  adminJwt: {
    secret: env('ADMIN_JWT_SECRET'),
    expiresIn: env('ADMIN_JWT_EXPIRES', '12h'),
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
    // PEM 形式（v1.6.11 起优先）：Node 17+ 自带 OpenSSL 3 会拒绝微信 p12 的老式 RC2 加密
    // （报错 Unsupported PKCS12 PFX data），将 p12 转成 PEM 后走 cert/key 加载即可全版本通用
    certPath: env('WX_CERT_PATH') || path.join(ROOT, 'src/data/apiclient_cert.pem'),
    keyPath: env('WX_KEY_PATH') || path.join(ROOT, 'src/data/apiclient_key.pem'),
    // 惰性读取证书，未配置证书时不阻断服务启动
    get pfx() {
      if (fs.existsSync(this.pfxPath)) {
        return fs.readFileSync(this.pfxPath);
      }
      return null;
    },
    get cert() {
      if (fs.existsSync(this.certPath)) {
        return fs.readFileSync(this.certPath);
      }
      return null;
    },
    get key() {
      if (fs.existsSync(this.keyPath)) {
        return fs.readFileSync(this.keyPath);
      }
      return null;
    },
    /** 退款等需证书的操作是否具备可用证书（PEM 优先，p12 兜底） */
    hasCert() {
      return Boolean((this.cert && this.key) || this.pfx);
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
