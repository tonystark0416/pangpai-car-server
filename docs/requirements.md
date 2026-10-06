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
| `/tryLogin` | GET | openid 联合登录（自动注册），查找顺序见下 |
| `/getUserDriverInfo` | GET | 按 uid 查询驾驶证信息 |
| `/updateUserDriverInfo` | GET | 新增/更新驾驶证信息（姓名、身份证号、身份证图片 URL、出生日期） |
| `/getIdCardInfo` | GET | 微信 OCR 身份证识别（`cv/ocr/idcard`），传 `img_url` |
| `/upload` | POST | multer 上传身份证照片至 `UPLOAD_DIR`，返回 `{code:200, path: IMAGE_BASE_URL/images/<filename>}` |
| `/images/*` | GET | 静态图片服务（`express.static`，1 小时浏览器缓存） |

**流程**：上传身份证照片 → OCR 识别回填 → 保存至 `pp_driver` 表。

**多小程序共享用户设计（v1.4.0）**：两个业务小程序共用 `adp_user` 统一身份，登录态走 `adp_user_auth` 授权表（一个小程序一行）。`/tryLogin` 查找顺序：

1. 按 `(biz_code, openid)` 查授权表 → 命中直接登录
2. 传入 `unionid` 且 ①未命中 → 按 unionid 找到其他小程序的授权 → 复用同一 `user_id`（跨业务自动关联）
3. 均未命中 → 新建 `adp_user` + `adp_user_auth`

当前两小程序不在同一开放平台下、暂无 unionid，跨业务关联先依赖手机号等后续手段；表结构与代码已预留 unionid 通路，未来绑定同一开放平台后自动生效。业务标识由 `.env` 的 `BIZ_CODE` 配置（当前 `pp`）。`adp_user.openid` 为存量字段（47 条已迁移至授权表），新用户不再写入该列。

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

**回调处理流程（v1.5.0 起闭环）**：验签 → 订单存在性核验 → **金额核验**（回调 total_fee vs 订单 total_price×100）→ **落库**（`pay_status=1`、`transaction_id`、`pay_time`，`WHERE pay_status=0` 保证幂等）→ 企业微信通知员工 → 应答 SUCCESS。验签失败/订单不存在/金额不一致/DB 异常应答 FAIL（微信按 15s/1m/…策略重推）；重复通知幂等跳落后仍应答 SUCCESS。

### 2.4 运营管理

#### 管理后台（v1.6.0，`/admin-api`，JWT 鉴权）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/admin-api/auth/login` | POST | 管理员登录（`adp_admin_user` 表，bcrypt 校验），返回 JWT；同时更新 `last_login_at` |
| `/admin-api/auth/profile` | GET | 当前管理员信息 |
| `/admin-api/dashboard/stats` | GET | 概览统计（用户/车辆/订单总数、已支付数、今日订单/支付金额） |
| `/admin-api/users` | GET | 用户分页列表（关键词支持手机号/昵称/openid），附订单数与授权数 |
| `/admin-api/users/:id` | GET | 用户详情（授权记录 `adp_user_auth`、驾驶证、最近 20 单） |
| `/admin-api/cars` | GET | 车辆分页列表（关键词） |
| `/admin-api/cars` | POST | 新增车辆 |
| `/admin-api/cars/:id` | PUT | 编辑车辆 |
| `/admin-api/cars/:id` | DELETE | 删除车辆（**存在关联订单时拒绝删除**） |
| `/admin-api/orders` | GET | 订单分页列表（筛选：pay_status/order_status/关键词），联表车辆信息 |
| `/admin-api/orders/:id` | GET | 订单详情（含车辆与下单用户信息） |
| `/admin-api/orders/:id/status` | PUT | 订单履约状态流转（待取车→已取车→已还车→已完成/已取消） |

管理后台前端（`admin-web/`，Vue 3 + Vite + Element Plus + Pinia）：登录页 + 概览 + 订单管理（筛选/详情/状态流转）+ 车辆管理（CRUD/图片预览）+ 用户管理（详情含跨小程序授权记录）。开发模式 `npm run dev`（vite 代理 `/admin-api` 与 `/images` 至 3002），构建产物 `dist/` 可由 Nginx 或 Express 静态托管。

#### 既有运营接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getQrCode` | GET | 生成不限量小程序码（scene + page），以 image/png 二进制返回，用于地推/渠道投放 |
| `/workWeixinCallback` | GET | 企业微信回调 URL 验证（仅 echostr 验证，无业务处理） |
| `/queryWxPayOrder` | GET | 微信支付查单（管理端用） |
| `/applyRefund` | POST | 申请退款（管理端用，走 p12 证书） |

### 2.5 定时任务（独立进程）

| 脚本 | 频率 | 说明 |
|---|---|---|
| `tasks/refreshAccessToken.js`（`npm run task:token`） | 启动即刷新一次 + 每小时整点 | 刷新小程序 + 企业微信 access_token，写入 `TOKEN_DIR`（`src/data`）下 txt 供运行时读取 |

---

## 3. 数据库设计

> v1.3.1 已按线上生产库（`mike`，42.194.245.3）实际结构校准。线上另有历史遗留表：`adp_admin_user`、`adp_banner`、`adp_goods`、`adp_order`、`union_goods`、`verification_codes`（旧业务/管理端，当前代码未使用）。

| 表名 | 用途 | 字段 |
|---|---|---|
| `pp_car` | 租赁车辆 | id, car_name(50), image_url(200), des(100), day_price, promotion_day_price(结算计价用), create_time, update_time |
| `pp_order` | 租车订单 | id, order_sn(50), uid, contact_phone(20), car_id, rent_day(**varchar(5)**), rent_day_price, rent_total_price, server_day_price/server_total_price（保险）, driver_price/driver_total_price, total_price, **pay_status（0待支付 1已支付 2已退款 3支付失败，v1.5.0）**, **transaction_id（微信支付单号）**, **pay_time**, **order_status（履约：0待取车 1已取车 2已还车 3已完成 4已取消，v1.5.0）**, pickup_address(100), return_address(100), pickup_time/return_time(**varchar(50)，毫秒时间戳字符串**), create_time, update_time |
| `adp_user` | 多业务线统一用户 | id, biz_code(11), username(20), password(255), nickname(50), avatar(255), openid(50)（存量字段，新用户不再写入）, phone(20), create_time, update_time |
| `adp_user_auth` | 用户授权表（v1.4.0，一个小程序一行） | id, user_id, biz_code(11), app_id(32)（预留）, openid(50), unionid(50)（待开放平台关联后启用）, create_time, update_time；唯一键 (biz_code, openid) |
| `pp_driver` | 驾驶证信息 | id, user_id, driver_idcard_name(10), driver_idcard_number(50), driver_idcard_url(200), driver_idcard_birth(20), create_time, update_time |

> 尚未建立但需要：订单**支付状态字段/表**（当前回调不落库）。
> 本地开发：`scripts/local-dev-init.sql` 可一键重建与线上一致的表结构 + 种子数据；当前 `.env` 直连线上库（注意写操作会入生产数据）。

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
| 1 | 支付回调不更新订单状态（TODO），支付与订单未闭环 | 高 | **v1.5.0 已修复（落库 + 金额核验 + 幂等）** |
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
| v1.3.1 | 2026-10-07 | 本地开发环境打通：① 修复 `localhost` DNS 解析失败（aTrust 覆盖 hosts，`DB_HOST` 改用 IP）；② `.env` 切换为直连线上生产库 `mike`（42.194.245.3，用户决策：本地与线上共用生产数据）；③ `scripts/local-dev-init.sql` 按线上真实表结构重写（含种子数据），作为离线备份环境；④ 需求文档数据库一节按线上实际结构校准，补充线上遗留表清单 | `getCarList` 已返回线上 12 辆真实车辆；注意本地调试的写操作（注册/下单/支付）会直接写入生产库 |
| v1.4.0 | 2026-10-07 | 多小程序共享用户体系：① 线上新建 `adp_user_auth` 授权表（唯一键 biz_code+openid，预留 unionid/app_id），`adp_user` 47 条存量 openid 全量迁移；② `registerUserByOpenid` 重写为三步查找（openid 命中 → unionid 跨业务关联 → 新建用户+授权）；③ 业务标识 `BIZ_CODE` 入 `.env`；④ `local-dev-init.sql` 同步授权表结构 | 当前两小程序不同开放平台、暂无 unionid，跨业务关联预留通路待开放平台合并后自动生效；线上已用真实 openid 验证登录命中路径（无写入） |
| v1.5.0 | 2026-10-07 | 支付回调落库闭环：① 线上 `pp_order` 新增 `pay_status`/`transaction_id`/`pay_time`/`order_status` 四字段；② 回调处理重写：验签 → 订单存在性 → 金额核验（分）→ 幂等落库（`WHERE pay_status=0`）→ 企微通知 → 应答，全分支正确应答（FAIL 触发微信重推）；③ 订单模型新增 `getOrderBySn`/`markOrderPaid` | 已用「合法签名假订单」正向测试（验签通过→订单不存在拒绝）与「篡改签名」反向测试（验签拒绝）验证，未污染生产数据；backlog #1 关闭 |
| v1.6.0 | 2026-10-07 | 管理后台第一期：① 后端 `/admin-api`：JWT 登录（`adp_admin_user` + bcrypt + `last_login_at`）、概览统计、用户（列表/详情含授权记录与驾驶证）、车辆（CRUD，有关联订单拒删）、订单（列表筛选/详情/履约状态流转）；② 前端 `admin-web/`（Vue3+Vite+Element Plus+Pinia）：登录、概览、订单/车辆/用户三模块页面；③ 新增依赖 `jsonwebtoken`/`bcryptjs`；④ `.env` 新增 `ADMIN_JWT_SECRET`/`ADMIN_JWT_EXPIRES` | 管理端接口全部经本地签发 token 对线上库只读验证通过（47 用户/12 车辆/38 订单）；后台实际部署后端仍需上线；`admin-web` build 产物 362KB CSS + 1MB JS（gzip 350KB） |
