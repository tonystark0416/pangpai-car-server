# 庞派汽车（pangpai-car）需求文档

> 版本：v1.3.0 ｜ 日期：2026-10-07 ｜ 状态：迭代中
>
> **每次迭代必须同步更新本文档正文与 Change Log，否则视为迭代未完成。**

---

## 1. 项目概述

「庞派汽车」是汽车租赁微信小程序的后端服务（对外域名 `https://pangpai-car.com`），核心业务为**线上租车**：用户在小程序登录 → 登记驾驶证 → 选车 → 结算计价 → 创建订单 → 微信支付 → 企业微信通知员工接单。

> 历史：项目曾孵化电商 CPS 联盟返佣业务线（京东/唯品会/美团），v1.3.0 已整体移除，详见 Change Log。

### 1.1 技术栈

| 类别 | 选型 |
|---|---|
| 运行时 | Node.js（服务器为 v24.11.1，宝塔 PM2 部署） |
| HTTP 框架 | **Express 4**（v1.1.0 起替代原生 http + switch 路由） |
| 配置管理 | **dotenv / .env**（v1.1.0 起替代明文 config 文件，模板见 `.env.example`） |
| 数据库 | MySQL（mysql2，Promise 化封装于 `src/utils/mysql.js`） |
| 支付 | 微信支付 V2（JSAPI 统一下单 / 查单 / 退款，MD5 签名 + XML + p12 证书） |
| 定时任务 | node-schedule（独立进程） |
| 文件上传 | multer（单文件 `file`，上限 10MB） |
| 其他 | axios、xml2js、md5、date-fns、dayjs、moment |

### 1.2 目录结构（v1.2.0 重排，标准 Express 分层）

```
pangpai-car/
├── app.js                    # Express 入口，监听 3002 端口
├── .env                      # 环境变量（敏感，不入库）
├── .env.example              # 环境变量模板（入库）
├── package.json              # scripts: start / dev / task:token
├── pangpaicar_start.sh       # 服务器 PM2 启动脚本
├── docs/requirements.md      # 本需求文档
├── https/                    # SSL 证书（不入库）
├── uploads/                  # 上传文件目录（不入库）
└── src/
    ├── config/index.js       # 统一配置中心（读 .env）
    ├── routes/               # 路由层（薄层，只做挂载）
    │   ├── index.js          # 路由汇总
    │   ├── user.routes.js    # 登录/驾驶证
    │   ├── car.routes.js     # 车辆
    │   ├── checkout.routes.js# 结算计价
    │   ├── order.routes.js   # 订单
    │   ├── payment.routes.js # 支付
    │   ├── wechat.routes.js  # 小程序码/企微回调
    │   └── upload.routes.js  # 文件上传
    ├── controllers/          # 业务控制器（Express req/res）
    │   ├── user.controller.js
    │   ├── car.controller.js
    │   ├── checkout.controller.js
    │   ├── order.controller.js
    │   ├── payment.controller.js
    │   ├── wechat.controller.js  # 小程序码 + 企微回调（合并原两处）
    │   └── upload.controller.js
    ├── models/               # 数据访问层
    │   ├── user.model.js     # adp_user / pp_driver
    │   ├── car.model.js      # pp_car
    │   └── order.model.js    # pp_order
    ├── services/             # 第三方服务封装
    │   └── wechat/
    │       ├── miniprogram.js  # token/jscode2session/OCR/小程序码（合并原两处）
    │       ├── work.js         # 企业微信
    │       └── pay.js          # 微信支付 V2
    ├── middlewares/
    │   ├── asyncHandler.js   # async 路由异常包装器
    │   └── upload.js         # multer 上传实例
    ├── utils/
    │   └── mysql.js          # MySQL 连接封装（含错误容错）
    ├── tasks/                # 独立运行脚本
    │   └── refreshAccessToken.js  # 定时刷新小程序/企微 access_token
    └── data/                 # 支付证书、access_token 缓存（不入库，原 file/）
```

**分层约定**：`routes`（路径 → 控制器）→ `controllers`（参数校验 + 编排）→ `models`（SQL）/ `services`（第三方 API），横切能力放 `middlewares`，纯工具放 `utils`。新增业务按此目录落位即可。

### 1.3 配置管理（v1.1.0）

所有配置统一收敛至根目录 `.env`，由 `src/config/index.js` 读取，严禁再往代码中写死密钥：

| 变量组 | 说明 |
|---|---|
| `PORT` | 监听端口（默认 3002） |
| `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_CHARSET` | MySQL 连接 |
| `WX_APPID/WX_SECRET` | 小程序凭据 |
| `WX_MCH_ID/WX_API_KEY/WX_NOTIFY_URL/WX_REFUND_NOTIFY_URL/WX_PFX_PATH/PAY_SPBILL_IP` | 微信支付 V2 |
| `WORK_CORPID/WORK_CORPSECRET/WORK_NOTIFY_USERID/WORK_MINIPROGRAM_PAGE` | 企业微信（含新订单通知接收人） |
| `UPLOAD_DIR/TOKEN_DIR/IMAGE_BASE_URL` | 上传目录、token 缓存目录、图片外链前缀 |

部署时：复制 `.env.example` 为 `.env` 填入真实值即可，无需改代码。

---

## 2. 主线业务：租车

### 2.1 用户与登录

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getOpenid` | GET | 小程序 `code` 调微信 `jscode2session` 换 openid |
| `/tryLogin` | GET | openid 联合登录：`adp_user` 表（`biz_code='pp'`）存在即登录，不存在自动注册 |
| `/getUserDriverInfo` | GET | 按 uid 查询驾驶证信息 |
| `/updateUserDriverInfo` | GET | 新增/更新驾驶证信息（姓名、身份证号、身份证图片 URL、出生日期） |
| `/getIdCardInfo` | GET | 微信 OCR 身份证识别（`cv/ocr/idcard`），传 `img_url` |
| `/upload` | POST | multer 上传身份证照片至 `UPLOAD_DIR`，返回 `{code:200, path: IMAGE_BASE_URL/images/<filename>}` |
| `/images/*` | GET | 静态图片服务（`express.static`，1 小时浏览器缓存） |

**流程**：上传身份证照片 → OCR 识别回填 → 保存至 `pp_driver` 表。

### 2.2 车辆与订单

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getCarList` | GET | 车辆分页列表（每页 10 条，按 `update_time desc`） |
| `/checkout` | GET | 结算计价 |
| `/getInsurancePrice` | GET | 保险报价（当前硬编码：L1 档 1 元/天、L2 档 120 元/天） |
| `/getDriverPrice` | GET | 司机服务报价（当前硬编码 400 元/天） |
| `/createOrder` | POST | 创建订单，body 为 `{checkOutArray: {...结算结果}}`，缺参返回 400 |
| `/getOrderList` | GET | 按 uid 分页查询订单 |
| `/getOrderDetail` | GET | 按 orderSn + uid 查订单详情（含车辆信息、格式化时间） |

**计价公式**（`src/controllers/checkout.controller.js` 的 `checkout`，入参 `uid/contact_phone/carId/pickUpTime/returnTime/pickUpAddress/returnAddress/insurancePrice/driver_price`）：

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
| `/queryWxPayOrder` | GET | 微信支付查单（v1.1.0 新挂载，管理端用） |
| `/applyRefund` | POST | 申请退款（v1.1.0 新挂载，管理端用，走 p12 证书） |

**回调处理现状**：验签通过后打日志，并通过**企业微信**按 `.env` 中 `WORK_NOTIFY_USERID` 推送小程序通知消息（新订单实时通知，通知内容为真实 `out_trade_no`）；**订单状态落库仍为 TODO，未闭环**。

### 2.4 运营管理

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getQrCode` | GET | 生成不限量小程序码（scene + page），以 image/png 二进制返回，用于地推/渠道投放 |
| `/workWeixinCallback` | GET | 企业微信回调 URL 验证（仅 echostr 验证，无业务处理） |

### 2.5 定时任务（独立进程）

| 脚本 | 频率 | 说明 |
|---|---|---|
| `tasks/refreshAccessToken.js`（`npm run task:token`） | 启动即刷新一次 + 每小时整点 | 刷新小程序 + 企业微信 access_token，写入 `TOKEN_DIR`（`src/data`）下 txt 供运行时读取 |

---

## 3. 数据库设计

| 表名 | 用途 | 主要字段 |
|---|---|---|
| `pp_car` | 租赁车辆 | id, promotion_day_price, update_time, 车辆信息字段 |
| `pp_order` | 租车订单 | order_sn, uid, contact_phone, car_id, rent_day/rent_day_price/rent_total_price, server_day_price/server_total_price（保险）, driver_price/driver_total_price, total_price, pickup_address/return_address, pickup_time/return_time, create_time/update_time |
| `adp_user` | 多业务线统一用户 | id, biz_code, phone, openid |
| `pp_driver` | 驾驶证信息 | user_id, driver_idcard_name/number/url/birth |

> 尚未建立但需要：订单**支付状态字段/表**（当前回调不落库）。

---

## 4. 部署

- 服务器：宝塔环境，Node 只监听 HTTP 3002，HTTPS 由前置 Nginx 终结。
- 启动：`pangpaicar_start.sh` → PM2 `ecosystem.config.cjs`（脚本需按新结构核对一次）。
- 本地开发：复制 `.env.example` 为 `.env`，`npm install && npm run dev`。
- 路径已全部改为可配置：`UPLOAD_DIR`/`TOKEN_DIR`/`WX_PFX_PATH` 不再写死 `/www/wwwroot/...`。

---

## 5. 已知问题与风险（迭代 backlog）

| # | 问题 | 风险等级 | 状态 |
|---|---|---|---|
| 1 | 支付回调不更新订单状态（TODO），支付与订单未闭环 | 高 | 待办 |
| 2 | 所有接口无鉴权，uid 由前端传参即信任 | 高 | 待办 |
| 3 | 订单号仅到秒级、无随机位，并发重号风险 | 中 | 待办 |
| 4 | `model/user.js` INSERT 驾驶证占位符 6 个 `?` 只传 5 个值 | 中 | **v1.1.0 已修复** |
| 5 | 敏感信息（数据库密码、微信 secret、商户 API 密钥、京东联盟密钥）明文硬编码 | 高 | **v1.1.0 已修复（迁入 .env）** |
| 6 | 保险/司机/整备费报价硬编码，无后台管理 | 中 | 待办 |
| 7 | 死代码/缺失依赖（`union_vip.js` 缺失、`router/` 遗留等） | 低 | **v1.2.0 已清理**；CPS 业务线整体于 **v1.3.0 移除** |
| 8 | 支付回调终端 IP、服务器绝对路径硬编码，环境耦合严重 | 中 | **v1.1.0 已修复（全部可配置）** |
| 9 | 无统一响应模型与错误处理，无日志体系 | 中 | 部分改善（v1.1.0 增加全局异常中间件与 asyncHandler） |
| 10 | 京东订单 5 秒轮询调试代码 | 低 | **v1.3.0 已随联盟业务删除** |

---

## Change Log

| 版本 | 日期 | 变更内容 | 备注 |
|---|---|---|---|
| v1.0.0 | 2026-10-07 | 基线版本：对存量代码逆向梳理，形成首版需求文档；创建 `.gitignore`；初始化 Git 仓库并推送至 GitHub（pangpai-car-server） | 敏感文件（证书、密钥配置、token 缓存）已排除入库 |
| v1.1.0 | 2026-10-07 | Express 重构 + .env 配置化：① 原生 http switch 路由改为 Express 分层路由（`src/routes/`）；② 全部密钥/DB/路径配置迁入 `.env`（含京东联盟密钥），新增 `.env.example` 模板与 `src/config/index.js` 配置中心；③ 删除明文配置文件与 `image.js`（由 `express.static` 替代）；④ 新增 `asyncHandler` 与全局异常中间件、MySQL 连接错误容错，DB 故障不再击穿进程；⑤ 新挂载查单 `/queryWxPayOrder`、退款 `/applyRefund` 管理端接口；⑥ 修复 `pp_driver` INSERT 占位符 bug；⑦ token 刷新任务支持启动即刷新，路径可配置 | 旧接口路径与响应结构完全兼容；`npm run dev` 可本地启动 |
| v1.2.0 | 2026-10-07 | 工程架构重排（标准 Express 分层）：① `src/server/{controller,model,base,admin,task,router}` 与 `src/util` 重组为 `src/{routes,controllers,models,services,middlewares,utils,tasks}`；② 微信 API 双文件合并（`weixin-api.js` + `weixin.api.js` → `services/wechat/miniprogram.js`），小程序码与企微回调控制器合并（`wechat.controller.js`），multer 拆为中间件 + 控制器；③ `src/file` → `src/data`（证书与 token 缓存）；④ 清理死代码：`router/` 遗留、`unionOrder.js`、`union_tran_url.js`、`meituan.js`、`parse_query.js`、`goods.js`；⑤ 任务脚本加 `require.main` 保护并统一命名 | 接口路径与响应结构不变；上传/静态图片/404/异常兜底全链路冒烟测试通过 |
| v1.3.0 | 2026-10-07 | 移除 CPS 联盟业务线：① 删除 `services/jd/union.js`、`tasks/fetchJdOrders.js`、`tasks/syncVipGoods.js` 及空目录 `services/jd/`；② 移除 `.env`/`.env.example` 中 `JD_APP_KEY/JD_APP_SECRET`、配置中心 `jd` 段、`npm run task:jd` 脚本；③ 卸载仅联盟使用的 `crypto-js` 依赖；④ 文档同步：删除第 3 节联盟业务、`union_goods` 表与相关 backlog 项，章节重编号 | 项目回归纯租车单一业务；接口无任何变化，冒烟测试与 token 刷新任务验证通过；`union_goods` 表数据未清理，需要时可于数据库手动删除 |
