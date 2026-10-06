# 庞派汽车（pangpai-car）需求文档

> 版本：v1.0.0 ｜ 日期：2026-10-07 ｜ 状态：基线版本（存量代码逆向梳理）
>
> **每次迭代必须同步更新本文档正文与 Change Log，否则视为迭代未完成。**

---

## 1. 项目概述

「庞派汽车」是汽车租赁微信小程序的后端服务（对外域名 `https://pangpai-car.com`），核心业务为**线上租车**：用户在小程序登录 → 登记驾驶证 → 选车 → 结算计价 → 创建订单 → 微信支付 → 企业微信通知员工接单。

项目同时在孵化第二条业务线：**电商 CPS 联盟返佣分销**（京东联盟、唯品会联盟，美团联盟仅有草稿），用于租车用户流量变现。

### 1.1 技术栈

| 类别 | 选型 |
|---|---|
| 运行时 | Node.js（服务器为 v24.11.1，宝塔 PM2 部署） |
| HTTP 框架 | 原生 `http.createServer`，`app.js` 中 switch 手工路由，无框架 |
| 数据库 | MySQL（mysql2，Promise 化封装于 `src/util/mysql.js`） |
| 支付 | 微信支付 V2（JSAPI 统一下单 / 查单 / 退款，MD5 签名 + XML + p12 证书） |
| 定时任务 | node-schedule |
| 文件上传 | multer（单文件 `file`，上限 10MB） |
| 其他 | axios、xml2js、md5、crypto-js、date-fns、dayjs、moment |

### 1.2 目录结构

```
pangpai-car/
├── app.js                    # 入口，监听 3002 端口，路由分发
├── package.json
├── pangpaicar_start.sh       # 服务器 PM2 启动脚本
├── docs/requirements.md      # 本需求文档
├── https/                    # SSL 证书（不入库）
├── src/
│   ├── config/               # mysql_config.js / wx_api_config.js（敏感，不入库）
│   ├── file/                 # 支付证书、access_token 缓存（不入库）
│   ├── util/
│   │   ├── mysql.js          # MySQL 连接封装类
│   │   ├── upload.js          # multer 文件上传
│   │   ├── image.js           # /images/* 静态图片服务
│   │   ├── wechatPay.js      # 微信支付 V2 完整实现类
│   │   └── parse_query.js    # 空壳（待实现）
│   └── server/
│       ├── controller/       # 业务控制器
│       ├── model/            # 数据访问层
│       ├── base/             # 第三方 API 封装（微信/企微/京东/美团）
│       ├── admin/            # 管理端能力（小程序码生成）
│       ├── task/             # 定时任务脚本（独立进程）
│       └── router/           # 早期 MVC 尝试遗留（死代码，未挂载）
```

---

## 2. 主线业务：租车

### 2.1 用户与登录

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getOpenid` | GET | 小程序 `code` 调微信 `jscode2session` 换 openid |
| `/tryLogin` | GET | openid 联合登录：`adp_user` 表（`biz_code='pp'`）存在即登录，不存在自动注册 |
| `/getUserDriverInfo` | GET | 按 uid 查询驾驶证信息 |
| `/updateUserDriverInfo` | GET | 新增/更新驾驶证信息（姓名、身份证号、身份证图片 URL、出生日期） |
| `/getIdCardInfo` | GET | 微信 OCR 身份证识别（`cv/ocr/idcard`），传图片 URL |
| `/upload` | POST | multer 上传身份证照片至服务器 uploads 目录，返回 `https://pangpai-car.com/images/<filename>` |
| `/images/*` | GET | 静态图片访问，映射服务器本地 uploads 目录，1 小时浏览器缓存 |

**流程**：上传身份证照片 → OCR 识别回填 → 保存至 `pp_driver` 表。

### 2.2 车辆与订单

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getCarList` | GET | 车辆分页列表（每页 10 条，按 `update_time desc`） |
| `/checkout` | GET | 结算计价 |
| `/getInsurancePrice` | GET | 保险报价（当前硬编码：L1 档 1 元/天、L2 档 120 元/天） |
| `/getDriverPrice` | GET | 司机服务报价（当前硬编码 400 元/天） |
| `/createOrder` | POST | 创建订单（入参为 checkout 结果结构） |
| `/getOrderList` | GET | 按 uid 分页查询订单 |
| `/getOrderDetail` | GET | 按 orderSn + uid 查订单详情（含车辆信息、格式化时间） |

**计价公式**（`pp_checkoutController.checkout`，入参 `uid/contact_phone/carId/pickUpTime/returnTime/pickUpAddress/returnAddress/insurancePrice/driver_price`）：

- `rentDay = (returnTime - pickUpTime) / 86400000`
- 租金 = `promotion_day_price × rentDay`
- 整备费 = 1 元（硬编码）
- 保险费 = `insurancePrice × rentDay`
- 司机服务费 = `driver_price × rentDay`
- 上门取/送车费 = 0（预留）
- `total_price` = 以上各项之和

**订单号规则**：`PP + yyyyMMddHHmmss`（精确到秒，无随机位）。

### 2.3 支付

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getWxPay` | GET | JSAPI 统一下单，返回 prepayId + 前端拉起支付参数 |
| `/wxPayCallback` | POST | 微信支付异步回调（XML + MD5 验签） |

**回调处理现状**：验签通过后仅打日志，并通过**企业微信**给员工（userid: LiuWeiZhao）推送小程序通知消息（新订单实时通知）；**订单状态落库为 TODO，未闭环**。

`src/util/wechatPay.js` 另提供查单（`orderQuery`）、关单（`closeOrder`）、退款（`refund`，p12 双向认证）能力，暂未挂路由。

### 2.4 运营管理

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getQrCode` | GET | 生成不限量小程序码（scene + page），以 image/png 二进制返回，用于地推/渠道投放 |
| `/workWeixinCallback` | GET | 企业微信回调 URL 验证（仅 echostr 验证，无业务处理） |

### 2.5 定时任务（独立进程运行）

| 脚本 | 频率 | 说明 |
|---|---|---|
| `task/refresh_access_token.js` | 每小时整点 | 刷新小程序 + 企业微信 access_token，写入 `src/file/*.txt` 供运行时读取 |
| `task/run_goods.js` | 一次性脚本 | 唯品会联盟商品同步至 `union_goods` 表（upsert）；依赖 `union_vip.js`（文件缺失） |
| `task/run_order.js` | 每 5 秒（调试代码） | 京东联盟订单轮询，仅打印未落库 |

---

## 3. 第二业务线：CPS 联盟分销（开发中，未挂载路由）

- **京东联盟**（`base/union_jd.js`）：MD5 签名网关封装，支持 `getJdtranUrl`（转推广短链，带 subUnionId 追踪）与 `getJdOrderList`（订单拉取）。
- **唯品会联盟**：`base/union_vip.js` 文件缺失；`controller/union_tran_url.js` 保留了转链与商品搜索的调用设计。
- **美团联盟**（`base/meituan.js`）：仅签名结构草稿，语法不完整。
- **设想流程**：小程序展示 `union_goods` 商品池 → 用户点击 → 转推广链接跳转第三方平台 → 产生佣金 → 定时任务拉取联盟订单结算。

---

## 4. 数据库设计

| 表名 | 用途 | 主要字段 |
|---|---|---|
| `pp_car` | 租赁车辆 | id, promotion_day_price, update_time, 车辆信息字段 |
| `pp_order` | 租车订单 | order_sn, uid, contact_phone, car_id, rent_day/rent_day_price/rent_total_price, server_day_price/server_total_price（保险）, driver_price/driver_total_price, total_price, pickup_address/return_address, pickup_time/return_time, create_time/update_time |
| `adp_user` | 多业务线统一用户 | id, biz_code, phone, openid |
| `pp_driver` | 驾驶证信息 | user_id, driver_idcard_name/number/url/birth |
| `union_goods` | 联盟商品池 | goods_name, goods_img, goods_url, goods_price, platform, goods_platform_id |

> 尚未建立但需要：订单**支付状态字段/表**（当前回调不落库）。

---

## 5. 部署

- 服务器：宝塔环境，Node 只监听 HTTP 3002，HTTPS 由前置 Nginx 终结。
- 启动：`pangpaicar_start.sh` → PM2 `ecosystem.config.cjs`。
- 硬编码路径：`/www/wwwroot/mikeapp/`（代码目录）、`/www/wwwroot/uploads/`（上传目录）。

---

## 6. 已知问题与风险（迭代 backlog）

| # | 问题 | 风险等级 |
|---|---|---|
| 1 | 支付回调不更新订单状态（TODO），支付与订单未闭环 | 高 |
| 2 | 所有接口无鉴权，uid 由前端传参即信任 | 高 |
| 3 | 订单号仅到秒级、无随机位，并发重号风险 | 中 |
| 4 | `model/user.js` INSERT 驾驶证占位符 6 个 `?` 只传 5 个值 | 中 |
| 5 | 敏感信息（数据库密码、微信 secret、商户 API 密钥、京东联盟密钥）明文硬编码 | 高 |
| 6 | 保险/司机/整备费报价硬编码，无后台管理 | 中 |
| 7 | 死代码/缺失依赖：`union_vip.js` 缺失、`router/` 遗留、`unionOrder.js`/`meituan.js`/`parse_query.js` 空壳 | 低 |
| 8 | 支付回调终端 IP、服务器绝对路径硬编码，环境耦合严重 | 中 |
| 9 | 无统一响应模型与错误处理，无日志体系 | 中 |
| 10 | `run_order.js` 硬编码 5 秒轮询属调试代码 | 低 |

---

## Change Log

| 版本 | 日期 | 变更内容 | 备注 |
|---|---|---|---|
| v1.0.0 | 2026-10-07 | 基线版本：对存量代码逆向梳理，形成首版需求文档；创建 `.gitignore`；初始化 Git 仓库并推送至 GitHub（pangpai-car-server） | 敏感文件（证书、密钥配置、token 缓存）已排除入库 |
