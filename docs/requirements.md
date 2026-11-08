# 庞派汽车（pangpai-car）需求文档

> 版本：v1.7.12 ｜ 日期：2026-11-08 ｜ 状态：迭代中
>
> **每次迭代必须同步更新本文档正文与 Change Log，否则视为迭代未完成。**

---

## 文档地图（本文 vs 小程序接口文档）

| 文档 | 主要读者 | 内容 |
|---|---|---|
| `docs/requirements.md`（本文） | 项目负责人、**后端迭代** | 需求背景、业务与技术规则、目录结构、表结构、部署流程、已知问题、版本 Change Log |
| `docs/api-for-miniprogram.md` | **小程序前端开发** | 全部 C 端接口的入参/响应/枚举/错误码、调用先后顺序、联调自测清单、接口 Change Log |
| `docs/prompt-for-miniprogram-agent.md` | 项目负责人（派活时） | 交付给小程序开发 agent 的 **prompt 模板**（含金额口径、优惠券流程、手机号必填等硬约束），填占位符后直接用 |

> **分工**：本文回答「**为什么这么做、规则是什么**」；接口文档回答「**具体怎么调**」。
> **联动约定**：任何改动只要涉及 C 端接口，两处都要更新，且必须在接口文档的 Change Log 登记。
> **给外部/前端同学时**：优先只给接口文档（不含本文 §3 表结构、§4 部署等内部信息）；确需业务规则时，再单独给本文 §2 相关小节。

## 目录

- [1. 项目概述](#1-项目概述)
  - [1.1 技术栈](#11-技术栈)
  - [1.2 目录结构（v1.7.3 重排，标准 Express 分层与管理后台）](#12-目录结构v173-重排标准-express-分层与管理后台)
  - [1.3 配置管理（v1.1.0）](#13-配置管理v110)
- [2. 主线业务：租车](#2-主线业务租车)
  - [2.1 用户与登录](#21-用户与登录)
  - [2.2 车辆与订单](#22-车辆与订单)
  - [2.3 支付](#23-支付)
  - [2.4 运营管理](#24-运营管理)
  - [2.5 定时任务](#25-定时任务)
- [3. 数据库设计](#3-数据库设计)
- [4. 部署](#4-部署)
  - [4.1 后端（API 服务）](#41-后端api-服务)
  - [4.2 管理后台（admin-web，v1.6.0 起）](#42-管理后台admin-webv160-起)
  - [4.3 本地开发](#43-本地开发)
- [5. 已知问题与风险（迭代 backlog）](#5-已知问题与风险迭代-backlog)
- [Change Log](#change-log)

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
| 文件上传 | multer（通用上传 `POST /upload`：单文件 `file`、上限 10MB、落 `uploads` 根；**v1.7.4 后台车辆图 `uploads/car_img`**：jpg/png/webp、单张 ≤5MB） |
| 后台鉴权 | JWT（jsonwebtoken，`src/utils/jwt.js`，中间件 `adminAuth`） |
| Excel 导出 | exceljs（v1.6.13 起，后台订单导出为 `.xlsx`） |
| 管理后台前端 | Vue 3 + Vite + Element Plus + Pinia（`admin-web/`，产物由 Express 托管至 `/admin`） |
| 其他 | axios、xml2js、md5、date-fns、dayjs、moment |

### 1.2 目录结构（v1.7.3 重排，标准 Express 分层与管理后台）

```
pangpai-car/
├── app.js                       # Express 入口，监听 3002；托管 admin-web/dist 至 /admin
├── .env / .env.example          # 环境变量（敏感，不入库）/ 模板（入库）
├── package.json                 # scripts: start / dev / task:token
├── ecosystem.config.cjs         # PM2 配置（主服务 pangpaicar + token 任务 pangpai-token）
├── pangpaicar_start.sh          # 服务器启动脚本
├── AGENTS.md                    # **AI 协作契约与项目理解入口**（CodeBuddy / Cursor / Claude Code / Codex 通用，随仓库走，换账号不丢）
├── .codebuddy/rules/            # CodeBuddy 项目规则（各 `RULE.mdc`，入库共享）：红线约束 / 文档工作流
├── docs/
│   ├── requirements.md          # 本需求文档（唯一需求与迭代追踪文档）
│   ├── ai-context.md            # **AI 深度技术上下文**：链路实现细节、SQL、易错点明细（供 Agent 开工前通读）
│   └── api-for-miniprogram.md   # 交付小程序前端的接口文档（含 Change Log）
├── scripts/                     # 一次性迁移脚本（均幂等，执行后保留备查）
│   ├── local-dev-init.sql                     # 本地一键建表 + 种子数据
│   ├── migrate_user_to_pp.js                  # v1.6.15 adp_user → pp_user
│   ├── migrate_user_phone_unique.js           # v1.7.0 手机号唯一索引 + 孤儿授权清理
│   ├── migrate_car_fee_fields.js              # v1.6.18 车辆整备费/保险费字段
│   ├── migrate_order_clean_price_position.js  # v1.6.19 订单字段顺序调整
│   ├── migrate_coupon.js                      # v1.7.3 优惠券两张表 + 订单 4 列
│   ├── migrate_car_detail_fields.js           # v1.7.6 车辆 images/tags/config JSON 列
│   └── migrate_pay_record.js                  # v1.7.9 支付流水表（--backfill 回填历史）
│   ├── gen_docs_toc.js                        # v1.7.3 文档目录生成/校验（见下）
│   └── sort_changelog.js                      # v1.7.3 Change Log 按版本号排序（见下）
├── https/                       # SSL 证书（不入库）
├── uploads/                     # 上传目录（不入库）：根=通用上传；car_img/=v1.7.4 后台车辆图片（服务启动自动创建）
├── logs/                        # PM2 日志（不入库）
├── admin-web/                   # 管理后台前端（Vue 3 + Vite + Element Plus）
│   ├── vite.config.js           # dev 代理 /admin-api、/images 至 3002
│   ├── dist/                    # 构建产物，由 Express 托管到 /admin 路径
│   └── src/
│       ├── api/index.js         # axios 实例（自动带 admin_token）
│       ├── router/index.js      # 路由 + 登录守卫
│       ├── layout/AdminLayout.vue  # 侧边栏（概览/订单/车辆/优惠券/用户）
│       ├── utils/format.js      # formatDateTime（东八区）
│       ├── constants.js
│       └── views/               # Login / Dashboard / Orders / Cars / Coupons / CouponRecords / Users
└── src/
    ├── config/index.js          # 统一配置中心（读 .env）
    ├── routes/                  # 路由层（薄层，只做挂载）
    │   ├── index.js             # C 端路由汇总
    │   ├── user.routes.js       # 登录 / 注册 / 手机号 / 驾驶证
    │   ├── car.routes.js        # 车辆
    │   ├── checkout.routes.js   # 结算计价
    │   ├── order.routes.js      # 订单（含自助退款）
    │   ├── payment.routes.js    # 支付下单 / 回调 / 查单
    │   ├── coupon.routes.js     # v1.7.3 优惠券（C 端领券）
    │   ├── wechat.routes.js     # 小程序码 / 企微回调
    │   ├── upload.routes.js     # 文件上传
    │   └── admin/index.js       # /admin-api 汇总（JWT 校验在此）
    ├── controllers/             # 业务控制器（Express req/res）
    │   ├── user.controller.js   # tryLogin / loginByPhone / bindPhone / 驾驶证
    │   ├── car.controller.js
    │   ├── checkout.controller.js
    │   ├── order.controller.js
    │   ├── payment.controller.js
    │   ├── coupon.controller.js # v1.7.3 可领券列表 / 领券 / 我的券包
    │   ├── wechat.controller.js # 小程序码 + 企微回调
    │   ├── upload.controller.js
    │   └── admin/               # 后台：auth / car / order / user / coupon(v1.7.3) / upload(v1.7.4)
    ├── models/                  # 数据访问层（纯 SQL）
    │   ├── user.model.js        # pp_user / pp_user_auth / pp_driver
    │   ├── car.model.js         # pp_car
    │   ├── order.model.js       # pp_order
    │   ├── coupon.model.js      # v1.7.3 pp_coupon / pp_user_coupon
    │   ├── pay.model.js         # v1.7.9 pp_pay_record（支付/退款流水，幂等 upsert）
    │   └── admin.model.js       # 后台列表 / 统计 / 导出
    ├── services/                # 第三方服务与领域服务
    │   ├── pricing.service.js   # 计价唯一真源（含 v1.7.3 券抵扣）
    │   ├── refund.service.js    # 退款编排（按 pay_amount + 退款后退券）
    │   ├── coupon.service.js    # v1.7.3 券可用性判定与抵扣计算
    │   └── car.service.js       # v1.7.6 车辆轮播图/标签/配置字段归一化
    │   └── wechat/
    │       ├── miniprogram.js   # token / jscode2session / getPhoneNumber / OCR / 小程序码
    │       ├── work.js          # 企业微信通知
    │       └── pay.js           # 微信支付 V2（下单 / 查单 / 退款 / v1.7.9 退款查询）
    ├── middlewares/
    │   ├── asyncHandler.js      # async 路由异常包装器
    │   ├── adminAuth.js         # 后台 JWT 校验
    │   ├── upload.js            # multer 通用上传实例（uploads 根，10MB）
│   └── carUpload.js         # v1.7.4 后台车辆图片上传（uploads/car_img，格式/大小校验 + 错误统一转 JSON）
    ├── utils/
    │   ├── mysql.js             # MySQL 连接封装（含错误容错）
    │   ├── jwt.js               # 后台 token 签发 / 校验
    │   ├── validate.js          # 手机号规范化与校验（结算 / 下单共用）
    │   └── time.js              # 时间格式化（东八区，v1.7.5）
    ├── tasks/
    │   ├── refreshAccessToken.js # 定时刷新小程序 / 企微 access_token
    │   └── checkPendingPayments.js # v1.7.8 定时查单兜底（回调丢失时补写订单支付状态）
    └── data/                    # 支付证书、access_token 缓存（不入库）
```

**分层约定**：`routes`（路径 → 控制器）→ `controllers`（参数校验 + 编排）→ `models`（纯 SQL）/ `services`（第三方 API 与领域逻辑），横切能力放 `middlewares`，纯工具放 `utils`。新增业务按此目录落位即可。

**新增业务的标准落位（以 v1.7.3 优惠券为例）**：`scripts/migrate_*.js`（建表，幂等）→ `src/models/<模块>.model.js`（SQL）→ `src/services/<模块>.service.js`（规则判定/计算）→ `src/controllers/<模块>.controller.js` + `admin/<模块>.controller.js`（C 端/后台两套）→ `src/routes/<模块>.routes.js` + `admin/index.js`（挂载）→ `admin-web/src/views/<模块>.vue` + `router/index.js` + `AdminLayout.vue`（后台页面）。

**计价相关改动必须收敛到 `services/pricing.service.js`**（`/checkout`、`/createOrder`、后台改价均以此为唯一真源），避免多处算价不一致。

**文档目录用工具维护**：两份文档的「目录」区块由 `scripts/gen_docs_toc.js` 生成，请勿手改其中的锚点——GitHub 的 slug 规则不直观（⭐ 会保留、连续空格会变成连续连字符），手改极易写出跳不过去的链接。

```bash
node scripts/gen_docs_toc.js check    # 校验两份文档的目录锚点是否都能跳转（建议在提交前跑）
node scripts/gen_docs_toc.js update   # 新增/改名章节后，一键重写目录区块
node scripts/sort_changelog.js        # Change Log 按版本号重排（默认降序，最新在最上）
```

**Change Log 统一倒序**（最新版本在最上面）：历史上是「追加到末尾」的升序写法，与后来「新条目插到最上面」的写法混用导致顺序错乱，前端同学按行读下来会误以为版本倒着走。新条目直接写在 Change Log 表格首行，写完跑一次 `sort_changelog.js` 即可。

**给 AI 的三份入口文件（v1.7.4）**：

| 文件 | 谁会读 | 内容 |
|---|---|---|
| `AGENTS.md`（根目录） | **任何 AI Agent / 新会话** | 协作契约：红线规则（不自动 commit/push、迭代必须更文档）、项目速查、目录地图、编码约定、已知坑清单。CodeBuddy 在无 `CODEBUDDY.md` 时自动加载全文；Cursor / Claude Code / Codex 同样识别该文件 |
| `.codebuddy/rules/*/RULE.mdc` | CodeBuddy | 结构化项目规则（frontmatter：`description` / `alwaysApply` / `enabled`）。`pangpai-car-core` 常驻加载，`pangpai-car-docs` 按需加载 |
| `docs/ai-context.md` | 要动手改代码的 Agent | 深度技术上下文：各链路实现细节、关键 SQL、枚举、基础设施、缺陷明细 |

> **背景**：项目约定此前只存在于 AI 的账号记忆里，更换 CodeBuddy 账号后会整体丢失（2026-10-31 实测发生了「不知道不能自动 commit、不知道要同步文档」的情况）。这三份文件**入库随项目走**，是当前唯一可靠的载体。
> **维护约定**：红线规则变化时，`AGENTS.md` 与 `.codebuddy/rules/pangpai-car-core/RULE.mdc` 必须**同步修改**，避免两处口径打架；实现细节有变化时更新 `docs/ai-context.md`。

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

> **对外接口文档**：`docs/api-for-miniprogram.md` 是交付给小程序前端的唯一接口文档（含全部 C 端接口的入参、响应、枚举与变更记录）。**规则：任何涉及小程序端接口的改动，提交前必须同步更新该文档及其末尾 Change Log**，否则视为迭代未完成。

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getOpenid` | GET | 小程序 `code` 调微信 `jscode2session` 换 openid（**不做任何注册**） |
| `/tryLogin` | GET | **登录**（只查不注册）：该微信已有账号 → `200` + 用户行（含 `id`=uid）；尚无账号 → `202 {needRegister:true, registerBy:'phone'}`（v1.7.2 语义：= 尚未注册，**不是缺手机号**；`needPhone` 为等价兼容字段） |
| `/loginByPhone` | GET | **注册**（v1.7.0 起账号体系主入口，注册/登录合一）：入参 `code`（`<button open-type="getPhoneNumber">` 回调的 code，**非 wx.login 的 code**）+ 可选 `openid`/`unionid`；服务端向微信换真实手机号 → 手机号已存在则登录该号、不存在则建号注册 → 绑定 openid/unionid → `200` + 用户行（含 `id` 即 uid） |
| `/bindPhone` | GET | **v1.7.0 新增**：已登录用户补填手机号，入参 `uid` + `code`（老用户无手机号时可接入） |
| `/getUserDriverInfo` | GET | 按 uid 查询驾驶证信息 |
| `/updateUserDriverInfo` | GET | 新增/更新驾驶证信息（姓名、身份证号、身份证图片 URL、出生日期） |
| `/getIdCardInfo` | GET | 微信 OCR 身份证识别（`cv/ocr/idcard`），传 `img_url` |
| `/upload` | POST | multer 上传身份证照片至 `UPLOAD_DIR`，返回 `{code:200, path: IMAGE_BASE_URL/images/<filename>}` |
| `/images/*` | GET | 静态图片服务（`express.static`，1 小时浏览器缓存） |

**驾驶证流程**：上传身份证照片 → OCR 识别回填 → 保存至 `pp_driver` 表。

**账号注册/登录流程（v1.7.0 起，手机号为准）**

**先分清「登录」与「注册」两个动作**（v1.7.2 明确语义）：

| 动作 | 接口 | 回答的问题 | 结果 |
|---|---|---|---|
| **登录** | `/tryLogin` | 这个微信在本小程序**有没有账号**？ | 有 → `200` 登录成功（带 uid）；没有 → `202` **尚未注册** |
| **注册** | `/loginByPhone` | 用手机号建号并绑定当前微信 | `200` 返回 uid（手机号已存在则直接登录该号，不重复建号） |

> ⚠️ **`202` = 「该微信尚未注册账号」，不是「需要手机号」。** 手机号只是**当前唯一的注册手段**（响应里 `registerBy:'phone'`），将来若加验证码等方式只需扩展该字段，202 的语义不变。前端文案应写「请先注册 / 还没有账号」，不要写「请填写手机号」。

#### A. 新用户首次进入（从未注册过，或该 openid 未绑定任何账号）

| 步骤 | 调用 | 说明 / 返回 |
|---|---|---|
| 1 | `wx.login()` | 前端拿登录凭证 `code` |
| 2 | `GET /getOpenid?code=` | 换 `openid`（+ `session_key`、`unionid`），**不做任何注册** |
| 3 | `GET /tryLogin?openid=&unionid=` | 没有账号 → `202 {"needRegister":true,"registerBy":"phone"}` = **尚未注册**（**不会创建账号**） |
| 4 | 【注册】前端展示 `<button open-type="getPhoneNumber">` 授权按钮 | 用户点允许，回调拿到 `e.detail.code`（**一次性**） |
| 5 | `GET /loginByPhone?code=&openid=&unionid=` | ① 微信换真实手机号 → ② 按手机号建号（注册）→ ③ 绑定 openid/unionid → `200 + result{id=uid}` |
| 6 | 本地保存 `uid`，进入首页 | 后续所有接口都带 `uid` |
| 7 | （可选）`GET /bindPhone` 之外的资料补全：驾驶证走 `/upload` → `/getIdCardInfo` → `/updateUserDriverInfo` | 下单前建议先登记驾驶证 |

#### B. 老用户（v1.7.0 之前已用 openid 绑定过，可能无手机号）

| 步骤 | 调用 | 说明 / 返回 |
|---|---|---|
| 1 | `wx.login()` → `GET /getOpenid?code=` | 拿 openid |
| 2 | `GET /tryLogin?openid=&unionid=` | **已有账号 → `200 + result{id=uid}` = 登录成功，直接进首页**，与 v1.6.x 行为完全一致 |
| 3 | （可选）若 `result.phone` 为空，前端提示补手机号：`GET /bindPhone?uid=&code=` | 回填 `pp_user.phone`，之后换设备也能靠手机号找回账号 |

> 老用户不会收到 `202`（他们已有账号，`/tryLogin` 直接 `200` 登录成功），也不会被强制授权手机号；只有**尚未注册**的微信才走 A 流程。

#### C. 换设备 / 换微信号（同一手机号）

`/loginByPhone` 用手机号定位账号：号码已存在则直接登录到**原 uid**，并把新 openid 补绑上去，订单与驾驶证不丢。

#### D. 完整业务调用顺序（登录后）

```
uid 已就绪
  ↓
/getCarList            车辆列表（仅上架，按 sort）
  ↓
/getCarInfo?carId=&uid= 车辆详情（v1.7.5：带 uid 时返回券后价，未登录可省略）
  ↓
/getCarFee?carId=      该车的整备费 + 两档保险日单价（结算页展示用）
  ↓
/checkout              结算计价（服务端重算金额，返回 insurance_level）
  ↓
/createOrder           body = { checkOutArray: 上一步返回的整包 }  → 得到 order_sn
  ↓
/getWxPay              微信 JSAPI 下单 → wx.requestPayment
  ↓
/getOrderList / getOrderDetail   订单列表（支持 pay_status/order_status 筛选）与详情
  ↓
/cancelOrder（未支付）/cancelRefund（已支付未取车）   取消与退款
```

规则与边界：

- **手机号是账号唯一标识**（`pp_user.phone` 唯一索引 `uk_phone`，v1.7.0 加）；同一手机号 = 同一人，换微信登录也落到同一 uid 并补绑新 openid。
- **一个 openid 只能属于一个账号**：若授权时该 openid 已绑到别的 uid，返回 `400 该微信已绑定其他账号`（拒绝，绝不改写，避免串号）。
- openid 授权仍写 `pp_user_auth(user_id, biz_code, openid, unionid)`，唯一键 `(biz_code, openid)`。
- **老用户平滑过渡**：v1.7.0 之前已用 openid 绑定的用户（无手机号）仍可正常 `/tryLogin` 登录，只是不再有新用户靠 openid 自动建号；需要补手机号时前端接 `/bindPhone`。
- **孤儿授权自愈**：若 `pp_user` 行被删除而授权行残留（会让该 openid 永久登录失败且每次新建空用户），`/tryLogin` 会自动清理该孤儿行，使其可重新走手机号注册。
- 手机号快速验证能力由微信按次计费（约 0.03 元/次，新小程序有免费额度），且要求非个人主体小程序。

**多小程序共享用户设计（v1.4.0，v1.6.15 起为 pp_ 表）**：两个业务小程序共用 `pp_user` 统一身份，登录态走 `pp_user_auth` 授权表（一个小程序一行）。`/tryLogin`（v1.7.0 起为只查不注册）查找顺序：

1. 按 `(biz_code, openid)` 查授权表 → 命中直接登录
2. 传入 `unionid` 且 ①未命中 → 按 unionid 找到其他小程序的授权 → 复用同一 `user_id` 并补一行 openid 授权（跨业务自动关联）
3. 均未命中 → **返回 null（v1.7.0 起不再新建用户，前端转手机号注册）**

当前两小程序不在同一开放平台下、暂无 unionid，跨业务关联现依赖手机号（同一手机号落到同一 uid）；表结构与代码已预留 unionid 通路，未来绑定同一开放平台后自动生效。业务标识由 `.env` 的 `BIZ_CODE` 配置（当前 `pp`）。

### 2.2 车辆与订单

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getCarList` | GET | 车辆分页列表（每页 10 条，**v1.6.7 起仅返回上架车辆 `status=1`，按 `sort` 升序、同 sort 按 id 倒序**） |
| `/getCarInfo` | GET | **v1.7.5 新增**：车辆详情。`carId` 必填；**`uid` 选填**——不传也能拿到车辆信息与参考价，**传了才计算券后价**（`pay_amount`）。取还车时间选填，都不传时按**默认 1 天**算参考价；计价一律走 `pricing.service`（唯一真源），券后价只做展示、**不锁定不核销**，实际用券仍由用户在结算页手选。**v1.7.6：车辆对象新增 `images`（轮播图数组）、`tags`（标签数组）、`config`（配置键值对）** |
| `/checkout` | GET | 结算计价（**v1.6.12：天数按 24h 向上取整且≥1 天；金额服务端重算；校验时间先后与保险/司机白名单**；**v1.7.3：可选 `couponSn` 券码，返回 `discount_price` 优惠额与 `pay_amount` 实付**） |
| `/getCouponList` | GET | **v1.7.3 新增**：可领取的券批次列表（`uid`），返回面额/库存/限领及当前用户 `my_received`、`can_receive` |
| `/receiveCoupon` | POST | **v1.7.3 新增**：领券（body `{uid, couponId}`），**原子扣库存 + 限领校验**，成功返回唯一券码 `coupon_sn` |
| `/getUserCoupons` | GET | **v1.7.3 新增**：我的券包（`uid`；`carId` 只返回该车可用的券；`status` 可筛选 0未用/1已用/2作废；**结算页额外传 `amount`=本次订单原价**），返回 `usable` 供前端置灰 + `unusable_reason` 说明不可用原因 |
| `/getInsurancePrice` | GET | 保险报价（**v1.6.18：传 `carId` 时按该车辆配置返回**，缺省系统默认 L1 100 / L2 200 元/天） |
| `/getCarFee` | GET | **v1.6.18 新增**：一次返回车辆的 `clean_price`（整备费，一次性）+ `insurancePrice_l1/l2`（保险日单价） |
| `/getDriverPrice` | GET | 司机服务报价（当前硬编码 400 元/天） |
| `/createOrder` | POST | 创建订单，body 为 `{checkOutArray: {...结算结果}}`，缺参返回 400（**v1.6.12：金额取服务端重算结果，不采信前端传价**；**v1.7.1：`contact_phone` 为结算页手填值，服务端不做账号手机号兜底**；**v1.7.3：`checkOutArray.coupon_sn` 携带券码时校验并核销，落库 `discount_price`/`pay_amount`；`contact_phone` **必填且必须为 11 位手机号，不合规则拒绝提交订单**） |
| `/getOrderList` | GET | 按 uid 分页查询订单 |
| `/getOrderDetail` | GET | 按 orderSn + uid 查订单详情（含车辆信息、格式化时间） |
| `/getOrderList` | GET | 分页查订单列表：`uid` + `pageNumber`；**v1.6.17 新增可选筛选** `pay_status` / `order_status`（支持逗号分隔多值、非法值忽略，不传等同旧行为），响应新增可选字段 `total`/`page`/`pageSize` |

**计价公式**（`src/controllers/checkout.controller.js` 的 `checkout`，入参 `uid/contact_phone/carId/pickUpTime/returnTime/pickUpAddress/returnAddress/insurancePrice/driver_price`）：

- `rentDay = (returnTime - pickUpTime) / 86400000`
- 租金 = `promotion_day_price × rentDay`
- 整备费 = 1 元（硬编码）
- 保险费 = `insurancePrice × rentDay`
- 司机服务费 = `driver_price × rentDay`
- 上门取/送车费 = 0（预留）
- `total_price` = 以上各项之和

**订单联系电话 `contact_phone`（v1.7.1 明确口径；**v1.7.3 起改为必填强校验**）**

- **取值口径**：结算页由**用户手工填写**，作为本次实际用车人的联系电话。**服务端不做任何默认值填充**（不会用 `pp_user.phone` 兜底），前端也不要拿账号手机号自动回填——账号手机号是登录凭证，与本次用车人可能不同（代人订车、公司用车）。
- **v1.7.3 起提交订单必填**：`/createOrder` 校验不通过直接 `400`，**不允许提交订单**。此前完全无校验，前端漏填时把空值 / `"undefined"` 直接落库（历史 45 单中 35 单为空号）。
  - 未填 / 空串 / `"undefined"` / `"null"` → `400 {"msg":"请填写联系人手机号"}`
  - 位数不对、号段非法 → `400 {"msg":"联系人手机号格式不正确，请填写 11 位手机号"}`
  - 规则：规范化后必须匹配 `^1[3-9]\d{9}$`
- **规范化**：入参先 `trim`、去掉空格与连字符、去掉 `+86` / `86` 前缀，落库统一为 11 位纯数字（如 `138 0013-8000` → `13800138000`）。
- **`/checkout` 不强校验**：结算页刚打开时用户往往还没填，这一步只做规范化回传，**最终由 `/createOrder` 拦截**。校验规则集中在 `src/utils/validate.js`，两处共用。

**订单号规则**：`PP + yyyyMMddHHmmss`（精确到秒，无随机位）。

#### 优惠券（v1.7.3）

**概念**：`coupon_id` = 券**批次号**（后台一次性创建，含面额/库存/时间/范围）；`coupon_sn` = 用户领到手的**唯一券码**（每次领券生成一张）。

**批次状态流转**：`未开始(0) → 活动中(1) → 已废弃(2)`，均由后台手工切换，**已废弃不可逆**。

#### 相对有效期：领取后 N 小时可用（v1.7.12）

批次新增 `valid_type`（`1`=固定时间段【原有】，`2`=**领取后 N 小时可用**）与 `valid_hours`（1~8760）。创建/编辑时二选一，固定时间段券行为完全不变。

**实现全靠领券快照，下游零改动**：用户券的可用期本来就是**领券那一刻**写入 `pp_user_coupon` 的绝对时间——`valid_type=2` 时只是把快照来源换成 `use_start_time = 领券时刻`、`use_end_time = 领券时刻 + valid_hours`。派生状态、C 端筛选、结算核验、过期判断认的都是用户券快照字段，因此**对用户券一侧完全同构，一行没改**。C 端可领列表新增返回 `valid_type` / `valid_hours`（小程序可自行拼「领取后 N 小时内可用」文案）。

**批次状态口径（valid_type=2）**：批次状态只看**领取窗口**——领取截止 = 批次结束（`ended`），**不再有 `claim_ended`（已停止领取但还能用）**，因为每张券的可用期各自独立，批次层面无从表达「全部用完时间」。批次上的 `use_start_time`/`use_end_time` 仅存领取窗口作兜底展示值，不参与过期判断。虚拟状态筛选（`active`/`ended` 等）已同步适配，`claim_ended` 筛选对相对券永不命中。

**编辑限制**：改成相对类型必须同时给 `valid_hours`；活动中的批次仍然只允许追加库存（原有规则不变）。已发出去的存量券不受影响（快照隔离）。

#### 状态口径：为什么「已过期」不落库（v1.7.7）

库里的 `status` 只有生命周期的**动作**（未开始/活动中/已废弃、未使用/已使用/已作废），**没有「已过期」**。`pp_coupon` 与 `pp_user_coupon` 也**不新增状态位**，改为在读取时派生：

| 对象 | 派生字段 | 取值 | 判定 |
|---|---|---|---|
| 用户券 | `state` | `usable` / `not_start` / **`expired`** / `used` / `invalid` | `status=1`→used；`status=2`→invalid；未开始→not_start；**`use_end_time < now` → expired**；否则 usable |
| 批次 | `runtime_status` | `not_start` / `active` / **`claim_ended`** / **`ended`** / `discarded` | `status=2`→discarded；**`now > use_end_time` → ended**；`now > receive_end_time` → claim_ended（领完了但还能用）；否则 active |

**为什么这样设计**：

1. **过期是时间的函数，不是动作**。写进 `status` 就要靠定时任务翻转，任务挂了数据就错位；本项目定时任务只有 token 刷新，多一个就多一个要盯的进程。
2. **「已过期」与「已使用/已作废」正交**。挤进同一字段会丢信息——一张券过期后，你再也分不清它是「过期未用」还是「运营手动作废」，而财务复盘要的正是这个区分。
3. 唯一真源已有：`validateCoupon` 一直按 `use_end_time` 判断，派生只是把它**暴露给展示层**。

**筛选怎么做（虚拟状态值 → SQL）**：不落库也能筛，接口 `status` 参数同时接受数字与字符串，`coupon.model` 里做翻译：

| 传值 | 翻译后的 SQL（用户券） |
|---|---|
| `expired` | `status = 0 AND use_end_time < NOW()` |
| `usable` | `status = 0 AND NOW() BETWEEN use_start_time AND use_end_time` |
| `not_start` | `status = 0 AND use_start_time > NOW()` |
| `0` / `1` / `2` | `status = ?`（**旧值完全兼容**） |

批次同理：`ended` / `claim_ended` / `active` / `not_start` / `discarded`。C 端券包默认**不过滤过期券**（保留置灰展示），由服务端按「可用在前、过期靠后」排好序。

| 环节 | 规则 |
|---|---|
| 领取 | 仅「活动中」且在领取时间窗口内的批次可领；每人限领 `per_limit` 张；库存原子扣减（`UPDATE ... WHERE remain_stock > 0`），扣不到即已领完 |
| 使用范围 | `scope_type=1` 全场通用；`=2` 仅指定车辆（逗号分隔 id）；**领券时把面额/范围/有效期快照到用户券**，批次后续改动不影响已领权益 |
| 每单张数 | **每单最多使用一张**，`/checkout` 与 `/createOrder` 只接收单个 `couponSn` |
| **是否默认使用** | **默认不使用任何优惠券**：只有结算页用户**手动选中**某张券、请求里带上 `couponSn`/`coupon_sn` 时才参与抵扣；**服务端绝不自动替用户选券**（哪怕是面额最大的那张） |
| **金额门槛（v1.7.3 补充规则）** | **订单金额必须大于券面额**才可用；订单金额 ≤ 券面额时该券**不可用**（券包里置灰、结算与下单均拒绝）。既避免 0 元订单，也避免「抵扣后倒找钱」的歧义 |
| 有效期 | 必须在 `use_start_time ~ use_end_time` 内，过期不可使用 |
| 废弃连带 | 后台废弃批次时，该批次下用户**已领未用**的券一并作废（`status=2`） |
| 退款 | 订单退款成功后券**退回账户可再次使用**；券有效期已过则不退回（避免留下用不了的脏券） |
| 限用 | 每人可用 `use_per_limit` 张（字段已落地，本期未做跨单累计校验） |

**金额口径（关键）**：

```
discount_price = min(券面额, total_price)       // 抵扣不超过应付，不出现负应付
pay_amount     = total_price - discount_price   // 实付，支付核验与退款均以此为准
total_price                                     // 保持原价不变，GMV/报表口径不受影响
```

资金链路同步调整：① `/getWxPay` 服务端校验传入金额等于订单 `pay_amount`×100（此前完全信任前端传值）；② 支付回调金额核验与 ③ 微信退款的 `total_fee` 均改用 `pay_amount`（否则券订单退款会失败）。历史订单 `pay_amount` 已回填为 `total_price`，无券订单口径完全不变。

**边界**：券面额 ≥ 订单金额时该券**不可用**（见上方「金额门槛」），因此正常使用路径不会产生 0 元支付。下单侧仍保留一道防御：即使绕过 `/checkout` 直接构造请求，只要抵扣后 `pay_amount ≤ 0` 就返回 `400` 并自动把券退回账户。

**结算页用券流程（前端）**：

```
① /checkout（不带券）                       → 拿到 total_price（原价）
② /getUserCoupons?uid=&carId=&amount=总价   → 列出可选券，按 usable / unusable_reason 置灰
③ 用户手动点选某张券（默认不选）
④ /checkout?...&couponSn=选中的券           → 得到 discount_price / pay_amount 并展示
⑤ /createOrder（checkOutArray 带 coupon_sn）→ 正式核销
```

金额门槛在 ②～⑤ **每一步都由服务端重新校验**，前端只在 UI 层置灰，不作终判。

**并发安全**：库存靠原子 UPDATE 防超发；限领靠 `COUNT` + 唯一键 `uk_coupon_uid_seq(coupon_id, uid, receive_seq)` 双保险，且限领拦截时会把已扣库存加回（否则库存被白白扣掉）；核销靠 `UPDATE ... WHERE status=0` 防止同一张券被用于多笔订单。

### 2.3 支付

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getWxPay` | GET | JSAPI 统一下单，返回 prepayId + 前端拉起支付参数 |
| `/wxPayCallback` | POST | 微信支付异步回调（XML + MD5 验签） |
| `/queryWxPayOrder` | GET | 微信支付查单（v1.1.0 新挂载，管理端用） |
| `/cancelRefund` | POST | **小程序端退款**：body/query `{orderSn, uid}`，**校验状态：仅「已支付 + 未取车」可退**（v1.6.11） |
| `/cancelOrder` | POST | **取消未支付订单**（v1.6.16，body/query `{orderSn, uid}`）：校验归属 uid + `pay_status=0` + `order_status=0`，仅置 `order_status=4`，**不涉及资金**；已支付订单会被拒绝并提示走 `/cancelRefund` |
| ~~`/applyRefund`~~ | POST | **已删除（v1.6.11）**：原为微信退款 API 裸透传，不校验状态且退款后不改订单状态。管理端用 `/admin-api/orders/:id/refund`，小程序端用 `/cancelRefund` |

**退款流程（v1.6.11 起闭环）**：

| 入口 | 订单状态校验 | 说明 |
|---|---|---|
| 管理后台 `POST /admin-api/orders/:id/refund` | **不校验**（按需求，后台可强制退款） | 可选 `refund_fee`（元，缺省全额）与 `refund_desc` |
| 小程序 `POST /cancelRefund` | **严格校验**：订单归属该 uid 且 `pay_status=1`（已支付）且 `order_status=0`（待取车） | 已取车后只能联系后台处理 |

两端共用 `src/services/refund.service.js` 的 `refundOrder()`：调微信 `secapi/pay/refund`（需 p12 证书双向认证）→ 微信返回 `SUCCESS` 后才由 `order.model.markOrderRefunded` 落库 `pay_status=2`（已退款）+ `order_status=4`（已取消）；**微信侧退款失败时绝不改订单状态**。退款单号固定为 `R+订单号`，重复提交便于幂等。
⚠️ **运行前提：服务器必须部署支付证书**，否则退款返回明确的“缺少证书”错误。两种加载方式（v1.6.11 实测）：

| 方式 | 配置 | 适用 |
|---|---|---|
| **PEM（推荐）** | `WX_CERT_PATH` + `WX_KEY_PATH`（默认 `src/data/apiclient_cert.pem` / `apiclient_key.pem`） | 全 Node 版本通用，**Node 17+ 必须用这个** |
| p12 兜底 | `WX_PFX_PATH`（默认 `src/data/apiclient_cert.p12`，口令=商户号） | 仅 Node 16 及以下 |

> **坑**：Node 17+ 自带 OpenSSL 3 禁用了微信 p12 使用的老式 RC2 加密，直接用 p12 会报 `Unsupported PKCS12 PFX data`（不是证书坏了）。转换命令（口令为商户号 `WX_MCH_ID`）：
> ```bash
> openssl pkcs12 -in apiclient_cert.p12 -nokeys  -out apiclient_cert.pem -passin pass:商户号
> openssl pkcs12 -in apiclient_cert.p12 -nocerts -nodes -out apiclient_key.pem  -passin pass:商户号
> ```
> 实测：用 PEM 发起退款，微信正常受理并返回业务结果（未支付订单返回 `ORDERNOTEXIST`），证明证书与签名链路通。
>
> **服务器（Node 18+）部署 PEM 的两种方式**（默认路径 `src/data/`）：
> ```bash
> # A. 在服务器上直接转换（p12 已在 src/data/，口令为商户号）
> cd /项目目录/src/data
> openssl pkcs12 -in apiclient_cert.p12 -nokeys  -out apiclient_cert.pem -passin pass:商户号
> openssl pkcs12 -in apiclient_cert.p12 -nocerts -nodes -out apiclient_key.pem  -passin pass:商户号
>
> # B. 本地转好后上传 cert/key 两个 pem 到 src/data/
> scp src/data/apiclient_cert.pem src/data/apiclient_key.pem root@服务器:/项目目录/src/data/
> ```
> 转换后无需改代码/环境变量（默认路径即生效），只需 `pm2 restart pangpaicar`。pem 含私钥，**不要提交进 git**（`src/data/` 已在 `.gitignore` 中）。

**回调处理流程（v1.5.0 起闭环）**：验签 → 订单存在性核验 → **金额核验**（回调 total_fee vs 订单 total_price×100）→ **落库**（`pay_status=1`、`transaction_id`、`pay_time`，`WHERE pay_status=0` 保证幂等）→ 写支付流水（v1.7.9）→ 企业微信通知员工 → 应答 SUCCESS。验签失败/订单不存在/金额不一致/DB 异常应答 FAIL（微信按 15s/1m/…策略重推）；重复通知幂等跳落后仍应答 SUCCESS。

#### 支付流水与后台支付管理（v1.7.9）

**诉求**：运营要看任意一笔支付/退款的明细，不必登录微信支付后台。

**此前的数据缺口（这是本模块真正的瓶颈）**：支付只记了 `pp_order.transaction_id` + `pay_time`；**退款完全没有流水**——`markOrderRefunded` 只把状态改成「已退款」，退了多少、什么时候退的、微信 `refund_id`、到账没到，本地一概查不到。所以顺序是**先补流水数据，再做界面**。

**表设计**：新建 `pp_pay_record`，**支付与退款共用一张表**，`record_type` 区分（1支付 / 2退款），差异字段存 `raw`(JSON)（微信原始返回，将来扩字段不必改表）。幂等键：`(record_type, out_trade_no)` 与 `out_refund_no`——**流水只追加，重复回调/重复同步不会产生重复行**。

| 字段 | 说明 |
|---|---|
| `amount` | 支付=实付（微信 `total_fee`），退款=退款额（`refund_fee_0`） |
| `status` / `status_text` | 微信状态原值与中文（支付 `SUCCESS`/`REFUND`/`NOTPAY`…；退款 `SUCCESS`/`PROCESSING`/`CHANGE`…） |
| `bank_type` | 付款银行 |
| `fund_change` | `Y` 即时到账（零钱）/ `N` 银行卡异步——**退款到银行卡是异步的，本地必须有这个字段才知道钱还在路上** |
| `source` | `callback` 回调 / `check` 查单兜底 / `manual` 后台同步 / `refund` 退款 / `backfill` 历史回填。一眼看出这笔流水是怎么来的 |

**写入时机（三处埋点，口径统一到 `pay.model`）**：

| 时机 | source | 说明 |
|---|---|---|
| 支付回调落库成功 | `callback` | 流水写入失败**不影响应答**（订单已落库，后台可点「同步」补回来） |
| 查单兜底补单成功 | `check` | 复用 v1.7.8 的 `checkPendingPayments` |
| 退款成功 | `refund` | 钱已在微信侧退，流水写失败也不阻断主流程 |

**新增微信接口**：`/pay/refundquery` 退款查询（`pay.js.refundQuery`，不需要证书）。四个标识四选一，本项目传 `out_trade_no` + `out_refund_no`。**V2 对单笔退款返回 `xxx_0` 形式**（`refund_status_0`/`refund_id_0`/`refund_fee_0`/`refund_success_time_0`），模型内用 `pickRefund()` 兼容带后缀与不带后缀两种返回。

**后台接口**（`/admin-api`，JWT）：

| 接口 | 说明 |
|---|---|
| `GET /pay-records` | 列表：类型/状态/关键词（订单号·微信单号·退款单号·手机号）/时间范围筛选 + 收款退款汇总 |
| `GET /pay-records/:id` | 详情，含 `raw` 微信原始返回 |
| `POST /pay-records/:id/sync` | **手动同步**：支付调 `orderquery`、退款调 `refundquery`，写回最新状态 |
| `GET /pay-records/export` | 导出 Excel（与列表同源筛选，≤20000 条） |
| `GET /orders/:orderSn/pay-records` | 某订单的资金流水（订单详情内嵌） |

**设计原则**：**本地库为主，微信侧只作核对源**。列表/详情直接读本地表（秒开、可筛选），只有人点「同步」才调微信——既不限频，也不会因为微信抖动导致页面打不开。**后台同步只更新流水，不改订单状态**：订单状态归属回调与查单兜底，避免两条口径打架。

**统计口径**：收款 = 支付流水中 `status IN (SUCCESS, REFUND)` 的金额（`REFUND` 表示曾收过款后来退了，不能算 0）；净收入 = 收款 − 退款，**为负数说明退得比收的多，属异常需人工核对**。

**历史数据**：`node scripts/migrate_pay_record.js --backfill` 用查单/退款查询回填 `pay_status IN (1,2)` 的历史订单（本次回填 12 条）。

**回填顺带做一次全量对账**：对所有已支付订单都查退款，**只传 `out_trade_no`**——传 `out_refund_no`（我们的 `R+订单号` 规则）查不到**在微信商户平台手工退的款**（那种退款单号由微信自动生成）。若发现「微信侧已退款但库内 `pay_status≠2`」，脚本打印 `⚠️ 不一致` 并给出修正 SQL，**不自动改库**。本次就是靠它发现了 `PP20261011204940`（详见 Change Log v1.7.9）。

#### 每日对账（v1.7.11）

**定位**：查单兜底（v1.7.8）管的是「支付漏了没」，每日对账管的是**每天全量账实核对**——以微信 `/pay/downloadbill` 账单为资金真源，与本地 `pp_pay_record` 逐笔核对，兜住回调、查单兜底之外的一切漏网（手工退款、未知原因漏单等）。

**账单接口的坑（实测）**：返回**不是 XML 而是 CSV**（`request()` 会炸，走 `requestRaw()` 拿原文）；列分隔是逗号不是 tab，文件带 BOM；数据行金额带 `` ` `` 前缀；字段值含逗号时用双引号包裹（需引号感知解析，`splitCsvLine`）；当天无账单/账单生成中返回 XML `error_code=20002`（`No Bill Exist` / `Bill Creating`）——**账单 T+1 生成，定在每天 09:30 跑前一天**。退款行的商户退款单号形如 `RPP2026...`（= `R` + 订单号）。

**对账规则**（按记账时间归属日期，本地流水按 `trade_time` 同口径）：

| 差异 | 处理 |
|---|---|
| 微信有支付/退款、本地无流水 | **自动补录**（`source=reconcile`）——流水只是记录，补了无害；补录由账单行伪造微信返回、复用 `buildPayRecord*`，字段口径与回调/兜底补的完全一致 |
| 金额不一致 | 只告警，人工核对（这种背后往往是计价/用券问题） |
| 本地有、微信账单无 | 只告警（本地脏数据，少见） |
| **微信已退款但订单 `pay_status` 未标记** | 只告警**不改订单状态**——动钱口径的事必须人工确认（v1.7.9 教训定的规矩） |
| 微信有交易但本地无订单 | 只告警（异常，需人工） |

**结果落库**：`pp_pay_reconcile` 一天一行（`uk_bill_date` 幂等，重复对账覆盖），`diff_detail`(JSON) 存差异明细、`summary`(JSON) 存微信账单汇总行——结论可复现。有差异发企微通知（小程序通知消息通道）。

**后台**：「支付管理 → 每日对账」标签页：结果列表（微信/本地笔数金额、差异、补录数）+ 手动对账任意历史日期（`POST /reconcile/run`，**当天及未来直接拒绝**——账单没生成）+ 差异明细弹窗 + 一键重新对账。

**对账流水（circular）风险说明**：本地流水写入依赖回调/兜底/对账三方，对账以**微信账单**为真源，不会因为本地漏了而永远对不上——漏了就补，这正是设计目的。


### 2.4 运营管理

#### 管理后台（v1.6.0，`/admin-api`，JWT 鉴权）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/admin-api/auth/login` | POST | 管理员登录（`adp_admin_user` 表，bcrypt 校验），返回 JWT；同时更新 `last_login_at` |
| `/admin-api/auth/profile` | GET | 当前管理员信息 |
| `/admin-api/dashboard/stats` | GET | 概览统计（用户/车辆/订单总数、已支付数、今日订单数/支付数；**v1.7.3 金额拆三口径**：`paidTodayAmount` 订单原价 GMV、`paidTodayDiscount` 优惠券抵扣、`paidTodayRealAmount` 实收金额）。`recent7Days` 每日与 summary 同样给出 `totalAmount`/`discountAmount`/`paidAmount` 三口径 |
| `/admin-api/users` | GET | 用户分页列表（关键词支持手机号/昵称/openid），附订单数与授权数 |
| `/admin-api/users/:id` | GET | 用户详情（授权记录 `adp_user_auth`、驾驶证、最近 20 单） |
| `/admin-api/cars` | GET | 车辆分页列表（关键词，可按 `status` 筛选上下架），按 sort 升序 |
| `/admin-api/cars` | POST | 新增车辆（支持 `status`、`sort`） |
| `/admin-api/cars/:id` | PUT | 编辑车辆（支持 `status`、`sort`，校验 sort 为 1~10000 整数） |
| `/admin-api/cars/:id/status` | PUT | **上下架切换**（v1.6.7，body `{status: 1\|0}`） |
| `/admin-api/cars/:id` | DELETE | 删除车辆（**存在关联订单时拒绝删除**） |
| `/admin-api/orders` | GET | 订单分页列表（筛选：pay_status/order_status/关键词），联表车辆信息 |
| `/admin-api/orders/:id` | GET | 订单详情（含车辆与下单用户信息） |
| `/admin-api/orders/:id/status` | PUT | 订单履约状态流转（待取车→已取车→已还车→已完成/已取消） |
| `/admin-api/orders/:id/address` | PUT | **修改取车/还车地址**（v1.6.10，body `{pickup_address?, return_address?}`，可单改一个；校验非空且 ≤100 字符） |
| `/admin-api/orders/:id/refund` | POST | **后台退款**（v1.6.11，body `{refund_desc?, refund_fee?}`，refund_fee 单位元、缺省全额；**不校验任何订单状态**）。**v1.7.3：退款金额以订单 `pay_amount`（实付）为上限**，缺省退全额实付；传入金额超过实付会被 `refund.service` 拒绝（`退款金额不合法：￥X（订单实付 ￥Y）`）——用券后订单若按 `total_price` 退会直接在微信侧失败 |
| `/admin-api/orders/export` | GET | **导出订单 Excel**（v1.6.13，`.xlsx`）。参数同列表 `pay_status/order_status/keyword`，额外 `scope=all` 时忽略条件导出全部；上限 20000 条；返回文件流需 `responseType=blob`；**v1.7.3 起导出含「优惠金额 / 实付金额 / 优惠券名称 / 优惠券码」四列** |
| `/admin-api/coupons` | GET | **优惠券批次列表**（v1.7.3，分页；筛选 `name`（匹配名称或批次号）、`status`；附带已领 `received_count`、已用 `used_count`） |
| `/admin-api/coupons` | POST | **创建券批次**（v1.7.3）：`name`/`amount`/`total_stock`/`receive_start_time`~`receive_end_time`/`use_start_time`~`use_end_time`/`scope_type`(1全场 2指定车辆)/`scope_car_ids`/`per_limit`/`use_per_limit`/`user_scope`(预留)/`bear_type`(默认 platform) |
| `/admin-api/coupons/:id` | GET | 批次详情 |
| `/admin-api/coupons/:id` | PUT | 编辑批次：**仅「未开始」状态可改规则**；「活动中」只允许追加库存 |
| `/admin-api/coupons/:id/status` | PUT | **状态流转**（body `{status: 0未开始 \| 1活动中 \| 2已废弃}`）：已废弃不可逆；**废弃时连带作废该批次下用户已领未用的券** |
| `/admin-api/coupons/:id/records` | GET | **用户领券记录**（v1.7.3，二级页面数据源）。`:id` 是 `pp_coupon` 的**数字主键**（不是批次号）；分页 `page`/`pageSize`，筛选 `status`（0未使用 1已使用 2已作废）与 `keyword`（券码/手机号/昵称/账号名）。返回 `{coupon, list, total, summary{unused,used,invalid,usedAmount}}`，`usedAmount` 为已使用券的面额合计（真实让利额） |
| `/admin-api/upload/car-image` | POST | **v1.7.4 新增**：后台车辆图片上传。`multipart/form-data`，字段名 `file`；限 jpg/png/webp、单张 ≤5MB；落盘 `uploads/car_img`；返回 `{code:0,data:{url,filename,size}}`，`url` 可直接写入 `car.image_url`。失败一律 HTTP 400 + `{code:400,msg}` |

管理后台前端（`admin-web/`，Vue 3 + Vite + Element Plus + Pinia）：登录页 + 概览 + 订单管理（筛选/详情/状态流转）+ 车辆管理（CRUD/图片预览）+ 用户管理（详情含跨小程序授权记录）+ **优惠券管理（v1.7.3：批次列表/新建/编辑/开始活动/废弃 +「领券记录」二级页面 `coupons/:id/records`）**。

领券记录页展示该批次每张券的：**券码、领取用户（昵称 + 手机号 + uid）、第几张、面额、状态、领取时间、使用时间、关联订单号、有效期**，支持按状态与关键词（手机号/昵称/账号名/券码）筛选，顶部给出累计领取 / 未使用 / 已使用 / 已作废 / 已核销金额五个统计。

> **易错点（本次踩过）**：批次有两个标识 —— `pp_coupon.id`（**数字主键**，即后台 API 的 `:id`）与 `coupon_id`（**批次号字符串**如 `CP2026102697RDZE`，存在 `pp_user_coupon.coupon_id`）。查领券记录必须**先用主键查出批次、再取它的 `coupon_id` 去关联用户券**；直接把 `:id` 当批次号传下去会查不到任何记录。

**v1.7.3 后台金额口径**：优惠券上线后，后台所有涉及钱的地方都要能看出「原价 / 优惠 / 实付」三者的关系，**不能只看 `total_price`**：

| 位置 | 改动 |
|---|---|
| 订单列表 | 「总价」改名「**订单原价**」，新增「优惠券（券名，悬停看券码）」「**优惠金额**」「**实付金额**」三列 |
| 订单详情 | 新增「优惠券 / 优惠金额 / 实付金额」三项 |
| **退款弹窗** | 原「实付金额」实际显示的是 `total_price`（原价），且**默认退款金额就填的是原价** → 用券订单点退款必然失败。现改为：显示原价/券信息/实付，退款金额**默认值与上限均取 `pay_amount`**，提交前前端再校验一次不得超额，并提示「券将在退款成功后退回用户」 |
| 概览「今日概览」 | 拆为「今日订单原价 GMV / 优惠券抵扣 / 实收金额」，注明「实收 = 原价 − 抵扣」 |
| 概览「近 7 日」 | 拆为「订单原价 / 优惠券抵扣 / 实收金额」三列，表尾合计同步 |
| 导出 Excel | 新增「优惠金额 / 实付金额 / 优惠券名称 / 优惠券码」四列 |

数据源上，`pp_order` 只存 `coupon_sn`，**券名不在订单表里**——后台列表/详情/导出通过 `LEFT JOIN pp_user_coupon uc ON uc.coupon_sn = o.coupon_sn AND o.coupon_sn <> ''` 取 `uc.name` / `uc.amount` 补齐（C 端订单详情同为此逻辑）。**退款金额的服务端上限校验在 `services/refund.service.js`**，后台与小程序端共用，两端口径天然一致。

列表/详情时间统一经 `src/utils/format.js` 的 `formatDateTime` 格式化为 `YYYY-MM-DD HH:mm:ss`（东八区，v1.6.4；**v1.7.4 补齐优惠券两处漏用的地方**）。开发模式 `npm run dev`（vite 代理 `/admin-api` 与 `/images` 至 3002），构建产物 `dist/` 由 Express 静态托管（v1.6.3 方案B，`/admin` 路径）。

> **v1.7.4 时间格式化修复**：优惠券批次列表的「领取时间 / 使用时间」两列、以及「领券记录」页**批次信息区块**的领取/使用时间，此前直接打印 MySQL `DATETIME` 序列化出的 ISO UTC 串（如 `2026-10-25T16:00:00.000Z`），运营侧不可读。现已统一接入 `formatDateTime`。**连带修复编辑弹窗回显**：`openForm` 原先把 ISO 串直接赋给 `value-format="YYYY-MM-DD HH:mm:ss"` 的 `el-date-picker`，选择器无法解析（Invalid Date / 显示为空），现回显前同样先格式化。这是既有工具的漏用补齐，无新增工具函数。

#### 后台车辆图片上传（v1.7.4）

新增/编辑车辆弹窗的「车辆图片」支持**直接选图上传**（此前只能手填图片 URL）：

| 项 | 规则 |
|---|---|
| 接口 | `POST /admin-api/upload/car-image`，**在 `adminAuth` 之后注册，必须带 JWT** |
| 字段名 | `file`（`multipart/form-data`），单个请求一张 |
| 落地目录 | `uploads/car_img`，即 `UPLOAD_DIR` 下的子目录；**服务启动即自动 `mkdirSync(recursive:true)` 创建，部署时无需手工建目录**（`uploads` 本身同理） |
| 允许格式 | jpg / png / webp，按 MIME 白名单校验，**后缀不取自 `originalname`**，规避中文/空格文件名与伪造后缀 |
| 大小上限 | 单张 5MB |
| 文件名 | `car-<yyyymmddHHMMSS>-<8位随机>.<ext>`，避免同名覆盖 |
| 返回 | `{code:0,data:{url,filename,size}}`，`url` = `IMAGE_BASE_URL + /images/car_img/xxx.png`，可直接回填 `image_url` |
| 错误处理 | 超限 / 格式不符 / 字段名不对统一返回 HTTP 400 + `{code:400,msg}`——multer 的错误不走 Express 异常链，若不加包装会被全局异常吞成 500 |

前端（`Cars.vue`）由 `el-upload` 的 `before-upload` 先做同样的类型与大小校验，再经自定义 `http-request` 走带 JWT 的 api 实例上传（超时放宽至 30s），成功后回填 `form.image_url`；**同时保留手填图片地址的输入框**，用于外链图或历史数据订正。

> **与旧上传接口的边界**：C 端公开接口 `POST /upload`（无鉴权、落 `uploads` 根、上限 10MB）保持不动，身份证等小程序端上传仍走它，两者互不影响。
> **⚠️ 依赖 `IMAGE_BASE_URL`**：该变量为空时会返回相对路径 `/images/car_img/xxx.png`，小程序 `<image>` 无法识别，生产环境必须配置（`.env.example` 已有此项）。图片经 `/images` 静态路由（Express 托管 `uploads`，缓存 1h）对外访问。

#### 既有运营接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/getQrCode` | GET | 生成不限量小程序码（scene + page），以 image/png 二进制返回，用于地推/渠道投放 |
| `/workWeixinCallback` | GET | 企业微信回调 URL 验证（仅 echostr 验证，无业务处理） |
| `/queryWxPayOrder` | GET | 微信支付查单（管理端用）。**v1.7.10 起管理端核对请用 `/admin-api/orders/:orderSn/check-wxpay`**（带 JWT、只读对比、自动查退款明细）；本接口保留给小程序端支付结果确认（文档联调步骤 8），无鉴权但仅透传微信查单结果 |
| ~~`/applyRefund`~~ | POST | **已删除（v1.6.11）**：裸透传微信退款且不改订单状态；管理端一律用下方 `/admin-api/orders/:id/refund` |

### 2.5 定时任务

| 脚本 | 运行方式 | 频率 | 说明 |
|---|---|---|---|
| `tasks/refreshAccessToken.js` | **PM2 应用 `pangpai-token`**（v1.6.5 起，`ecosystem.config.cjs` 托管；亦可 `npm run task:token` 临时跑） | 启动即刷新一次 + 每小时整点 | 刷新小程序 + 企业微信 access_token，写入 `TOKEN_DIR`（`src/data`）下 txt 供运行时读取 |
| `tasks/checkPendingPayments.js` | **PM2 应用 `pangpai-paycheck`**（v1.7.8 新增，`ecosystem.config.cjs` 托管；亦可 `npm run task:paycheck` 临时跑） | 启动即跑一轮 + 每 2 分钟一轮 | **支付查单兜底**：扫「未支付且未取消」的订单 → 调微信 `/pay/orderquery` → 微信侧已 SUCCESS 则复用 `markOrderPaid` 补写订单状态并补发企微通知 |
| `tasks/dailyReconcile.js` | **PM2 应用 `pangpai-reconcile`**（v1.7.11 新增，`cron_restart` 每天 09:30，跑完即退出；亦可 `npm run task:reconcile -- --date 2026-11-03` 手动跑任意天） | 每天 09:30 核对前一天 | **每日对账**：下载微信账单 `/pay/downloadbill` 与本地流水逐笔核对，差异落 `pp_pay_reconcile` 并发企微通知（详见 §2.3「每日对账」） |

**双保险机制（v1.6.5）**：① 定时任务负责常规小时级刷新；② 主服务读取侧兜底——`getAccessTokenCached()`（小程序）/ `getWorkTokenCached()`（企微）在缓存文件**缺失或超过 90 分钟未更新**（任务进程挂掉）时自动重取并落盘，微信 token 有效期 7200s，90 分钟阈值与小时级刷新留足余量。

#### 支付查单兜底（v1.7.8）

**要解决的问题**：订单支付状态的唯一真源是微信回调 `/wxPayCallback`，但回调依赖微信能访问我们的公网地址。网络抖动、部署重启、微信重推失败时，会出现**用户钱付了、订单仍显示待支付**——这是真实的资金与客诉风险。微信官方要求「回调 + 查单」双保险，本任务即第二道保险。

| 项 | 规则 |
|---|---|
| 扫描范围 | `pay_status = 0`（未支付）**且** `order_status = 0`（待取车，排除已取消废单）**且** 创建时间在 **3 分钟 ~ 24 小时** 之间（太新的用户可能正在付，太老的微信侧早已关单） |
| 每轮上限 | 50 条，串行执行，每条间隔 200ms（不打扰微信接口） |
| 判定 | 微信返回 `return_code=SUCCESS` + `result_code=SUCCESS` + **`trade_state=SUCCESS`** 才认为已支付；`NOTPAY`/`CLOSED`/`ORDERNOTEXIST` 一律不动库 |
| 金额核验 | 与回调同口径：`round((pay_amount ?? total_price) × 100)` 必须等于微信 `total_fee`，**对不上只记日志，绝不落库** |
| 落库 | 复用 `orderModel.markOrderPaid`（仅 `pay_status=0` 才更新），**幂等**；期间被回调先落库时会走「已支付，幂等跳过」 |
| 通知 | 补单成功补发企微通知（标注「支付回调补单」）——回调丢了意味着运营也没收到新订单通知 |
| 参数覆盖 | 环境变量 `PAY_CHECK_MIN_AGE` / `PAY_CHECK_MAX_AGE` / `PAY_CHECK_LIMIT` / `PAY_CHECK_STEP_DELAY` |

**人工核对**（不写代码也能查）：

```sh
npm run task:paycheck:once   # 单轮 + dry-run，只打印会补哪些单，不落库
npm run task:paycheck        # 常驻（本地调试用，线上交给 PM2）
```

---

## 3. 数据库设计

> v1.3.1 已按线上生产库（`mike`，42.194.245.3）实际结构校准。线上另有历史遗留表：`adp_admin_user`、`adp_banner`、`adp_goods`、`adp_order`、`verification_codes`（旧业务/管理端，当前代码未使用）。
>
> **表命名与清理约定（v1.6.20）**：历次迁移脚本会在库内生成 `<表名>_bak_<YYYYMMDD>` 备份表，属一次性快照、无任何代码引用；确认迁移无误后应及时 DROP，避免库内表过多干扰排查。**删除前必须先离线导出**（`CREATE TABLE` + `INSERT` 的 SQL 文件，不要留在项目目录内以免入库）。v1.6.20 已清理全部 5 张历史备份表。

| 表名 | 用途 | 字段 |
|---|---|---|
| `pp_car` | 租赁车辆 | id, car_name(50), image_url(200), des(100), day_price, promotion_day_price(结算计价用), create_time, update_time, **status(上下架：1上架 0下架，v1.6.7)**, **sort(排序值 1~10000 整数，越小越靠前，v1.6.7)**, **clean_price/insurance_price_l1/insurance_price_l2(费用配置，v1.6.18)**, **images(JSON 数组：详情页轮播图，最多 8 张，第 1 张为主图，v1.7.6)**, **tags(JSON 数组：车辆标签，最多 6 个，v1.7.6)**, **config(JSON 对象：配置参数键值对，最多 20 项，v1.7.6)** |
| `pp_order` | 租车订单 | 全部 23 字段均已加中文注释（v1.6.6）：id=订单ID, order_sn=订单号（PP+yyyyMMddHHmmss）, uid=下单用户ID（adp_user.id）, contact_phone=联系电话, car_id=车辆ID（pp_car.id）, rent_day=租车天数（**varchar(5)**）, rent_day_price=车辆日租金单价, rent_total_price=车辆租金合计, server_day_price=保险费单价（每天）, server_total_price=保险费合计, driver_price=司机服务费单价（每天）, driver_total_price=司机服务费合计, **clean_price=整备费快照（v1.6.18 新增，v1.6.19 调整至司机合计之后、总价之前）**, total_price=订单总价（**原价；v1.7.3 起实付另看 pay_amount**）, **coupon_id=优惠券批次号（v1.7.3）**, **coupon_sn=优惠券码（v1.7.3）**, **discount_price=优惠金额（v1.7.3）**, **pay_amount=实付金额=total_price-discount_price（v1.7.3，支付核验与退款以此为准；历史订单已回填为 total_price）**, **pay_status=支付状态 0待支付 1已支付 2已退款 3支付失败（v1.5.0）**, **transaction_id=微信支付单号**, **pay_time=支付时间**, **order_status=履约状态 0待取车 1已取车 2已还车 3已完成 4已取消（v1.5.0）**, create_time=创建时间, update_time=更新时间, pickup_address=取车地址(100), return_address=还车地址(100), pickup_time=取车时间（**varchar(50)，毫秒时间戳字符串**）, return_time=还车时间 |
| `pp_user` | 庞派用户（v1.6.15 从 `adp_user` 迁出，保留原主键） | id, biz_code(11), username(20), password(255), nickname(50), avatar(255), **phone(20)（v1.7.0 起为账号唯一标识，唯一索引 `uk_phone`）**, create_time, update_time |
| `pp_user_auth` | 用户授权表（一个小程序一行） | id, user_id(关联 pp_user.id), biz_code(11), app_id(32)（预留）, openid(50), unionid(50)（待开放平台关联后启用）, create_time, update_time；唯一键 `uk_biz_openid(biz_code, openid)`，另有 idx_user / idx_unionid |
| `pp_driver` | 驾驶证信息 | id, user_id, driver_idcard_name(10), driver_idcard_number(50), driver_idcard_url(200), driver_idcard_birth(20), create_time, update_time |
| `pp_coupon` | **优惠券批次表**（v1.7.3） | id, **coupon_id=批次号(唯一)**, name=券名称, amount=面额, **threshold=门槛（预留，本期不校验）**, total_stock/remain_stock=总库存/剩余库存, per_limit=每人限领, use_per_limit=每人可用, receive_start_time/receive_end_time=可领时间, use_start_time/use_end_time=可用时间, scope_type=使用范围(1全场 2指定车辆), scope_car_ids=适用车辆(逗号分隔), **user_scope=适用人群 0全部 1新用户 2老用户（预留）**, **bear_type=成本承担方 默认 platform（预留）**, status=状态(0未开始 1活动中 2已废弃), create_time, update_time |
| `pp_user_coupon` | **用户优惠券表**（v1.7.3） | id, **coupon_sn=券码(唯一)**, coupon_id=批次号, uid=领取用户, name/amount/scope_type/scope_car_ids/use_start_time/use_end_time=**领券时快照**（批次后续改动不影响已领权益）, status=状态(0未使用 1已使用 2已作废), receive_time=领取时间, use_time=使用时间, order_sn=使用订单, **receive_seq=该用户领本批次的第几张**, create_time, update_time；唯一键 `uk_coupon_sn`、`uk_coupon_uid_seq(coupon_id,uid,receive_seq)` 防超领 |

> 已迁出：`adp_user` / `adp_user_auth` / `adp_admin_user` 为其他项目在用，数据未删、代码不再引用（v1.6.15）。
>
> 尚未建立但需要：订单**支付状态字段/表**（当前回调不落库）。
> 本地开发：`scripts/local-dev-init.sql` 可一键重建与线上一致的表结构 + 种子数据；当前 `.env` 直连线上库（注意写操作会入生产数据）。

---

## 4. 部署

### 4.1 后端（API 服务）

- 服务器：宝塔环境（42.194.245.3），Node 只监听 HTTP 3002，HTTPS 由前置 Nginx 终结。
- 启动：`pangpaicar_start.sh` → PM2 `ecosystem.config.cjs`（v1.6.1 起配置文件入库；v1.6.5 起托管两个应用：主服务 `pangpaicar` + token 任务 `pangpai-token`，日志 `logs/`）。
- 环境变量：服务器上维护 `.env`（含 DB / 微信 / 支付 / 企微 / JWT 密钥），模板见 `.env.example`。
- 部署步骤：`git pull` → `npm install` → `pm2 restart pangpaicar pangpai-token`（首次 `pm2 start ecosystem.config.cjs` 一键拉起全部应用）。

### 4.2 管理后台（admin-web，v1.6.0 起）

- 开发：`admin-web/` 下 `npm install && npm run dev`（vite 代理 `/admin-api`、`/images` 至 `127.0.0.1:3002`）。
- 生产部署（v1.6.3 起为**方案B：主域名路径托管**，线上地址 `https://pangpai-car.com/admin`）：
  1. vite `base` 与 vue-router `createWebHistory` 均设为 `/admin/`（已入库）；
  2. 服务器上 `admin-web/` 执行 `npm install && npm run build` 产出 `dist/`（dist 不入库，必须在服务器构建）；
  3. Express（`app.js`）自动托管：存在 `admin-web/dist` 时挂载 `/admin` 静态目录 + SPA history 兜底，无需任何 Nginx 改动（整域已反代 3002）；接口走同域相对路径 `/admin-api`，无跨域问题。
- 升级后台只需重新 build + `pm2 restart pangpaicar`。
- ⚠️ 待办：后台目前仅 JWT 登录，无 IP 白名单/频控，建议后续加 Nginx 访问控制。

### 4.3 本地开发

- 复制 `.env.example` 为 `.env`（`DB_HOST` 用 IP 直连，勿用 `localhost`——部分环境下 hosts 缺失条目会导致 ENOTFOUND）。
- 后端 `npm install && npm run dev`（3002）；管理后台另起 `admin-web` 的 dev（5173）。
- 当前 `.env` 直连线上生产库：**本地调试的写操作（注册/下单/支付/后台改数据）会直接写生产数据**。
- 离线备用环境：`scripts/local-dev-init.sql` 一键重建同构表结构 + 种子数据。

> 路径已全部可配置：`UPLOAD_DIR`/`TOKEN_DIR`/`WX_PFX_PATH` 不再写死 `/www/wwwroot/...`。
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
| 11 | `src/data/wx_access_token.txt` 缓存不存在时接口直接 ENOENT（新环境/本地未跑 token 任务即触发） | 中 | **v1.6.2 已修复（读取兜底：自动获取 + 自动建目录落盘）** |
| 12 | token 刷新任务未托管，终端退出即停，缓存过期（>2h）后 OCR/小程序码/企微通知报 40001 | 中 | **v1.6.5 已修复（任务入 PM2 `pangpai-token` + 读取侧 90 分钟新鲜度兜底双保险）** |

---

## Change Log

> **本表按版本号倒序排列：最新版本在最上面。** 新增条目写在表格首行即可；若顺序不确定，运行 `node scripts/sort_changelog.js` 一键整理（会跳过正文，只排序本节）。

| 版本 | 日期 | 变更内容 | 备注 |
|---|---|---|---|
| v1.7.12 | 2026-11-08 | **优惠券相对有效期：「领取后 N 小时可用」**：① `pp_coupon` 加 `valid_type`（1=固定时间段/2=领取后N小时）与 `valid_hours`（1~8760）两列（`scripts/migrate_coupon_validtype.js` 幂等加列，存量批次默认 1 行为不变）；② 领券快照分支：`valid_type=2` 时用户券 `use_start_time`=领券时刻、`use_end_time`=领券时刻+N 小时——**下游派生状态/筛选/核验全部只认用户券快照，一行未改**；③ 批次状态口径：相对券批次只看领取窗口（领取截止=结束，无 `claim_ended`），批次上 use_start/use_end 仅存领取窗口兜底；派生函数与虚拟状态筛选 SQL 同步适配；④ 后台：创建/编辑表单加「有效期类型」选项（改为相对类型必须同时给时长），列表「使用时间」列相对券显示「领取后 N 小时内可用」（`valid_text`），校验 valid_hours 范围；⑤ C 端 `/getCouponList` 新增返回 `valid_type`/`valid_hours` | **设计核心**：v1.7.7 快照机制的直接受益——用户券可用期本来就是领券时刻写死的绝对时间，相对有效期只是换了个快照来源，过期判断/结算核验/券包展示零改动。批次与用户券状态分离：批次管「还能不能领」，用户券按各自快照独立过期。实测：相对券领券快照精确 24 小时（17:34:11 → 次日 17:34:11）、我的券派生 `usable`、C 端可领列表带 `valid_type/valid_hours`、批次派生 active→领取截止后 ended、虚拟筛选 `ended` 命中、固定券全回归（含 valid_text）；期间发现并修复后台列表 `valid_text` 拼接对 mysql2 返回的 Date 对象调 `.slice` 导致的 500（改用 dayjs 格式化）；测试批次/测试券已全部废弃清理，迁移幂等重跑通过。admin-web 构建通过 |
| v1.7.11 | 2026-11-04 | **每日对账（资金第三道保险，账实核对闭环）**：① `pay.js` 新增 `downloadBill`（`/pay/downloadbill`）+ `parseBill` 账单解析 + `splitCsvLine` 引号感知拆分——**账单返回是 CSV 不是 XML**（走 `requestRaw()` 拿原文），实测格式：逗号分隔、带 BOM、金额带 `` ` `` 前缀、含逗号字段用双引号包裹、无账单返回 XML `20002`（No Bill Exist / Bill Creating）；② 新表 `pp_pay_reconcile`（`scripts/migrate_pay_reconcile.js` 幂等建表）一天一行存对账结果，`diff_detail`/`summary` 存 JSON 留档可复现；③ 对账服务 `reconcile.service.js`：微信账单（**资金真源**）vs 本地流水逐笔核对——微信有本地无 → **自动补录**（`source=reconcile`，由账单行伪造微信返回复用 `buildPayRecord*`，口径与回调/兜底一致）；金额不一致/本地有微信无/微信已退款但订单未标记 → **只告警不改**（动钱口径必须人工确认）；④ 定时任务 `dailyReconcile.js`：PM2 应用 `pangpai-reconcile`（`cron_restart` 每天 09:30 跑前一天，跑完即退出），有差异发企微通知；⑤ 后台「支付管理 → 每日对账」标签页：结果列表、差异明细弹窗、手动对账任意历史日期（`POST /admin-api/reconcile/run`，当天及未来拒绝——账单 T+1） | **为什么 09:30**：账单 T+1 生成，凌晨实测仍返回 `Bill Creating`。**三级资金保险体系**：回调（实时）→ 查单兜底（分钟级，管支付漏单）→ 每日对账（天级，兜住一切漏网含手工退款）。实测：11-01/11-02 真实账单解析正确（支付行/退款行/汇总区）；对账 11-02 「完全一致」且重复对账幂等；**自愈测试**——删除 11-02 退款流水后对账自动补录（￥349，来源「每日对账补录」，退款单号 `RPP20261101231522`），数据复原；日期校验（当天/非法日期）正确拒绝；企微通知为小程序消息通道（本地 IP 白名单外会失败，不影响对账） |
| v1.7.10 | 2026-11-04 | **手机端会员注册协议页 + 后台「核对微信支付状态」**：① 新建 `public/` 静态站点（`express.static`，默认 fallthrough——文件不存在走 404 路由而非像 `/images` 抛 500），协议页 `public/agreement/membership.html`（单文件 H5、无外部依赖，内容区有「改哪里」注释），访问 `https://pangpai-car.com/agreement/membership.html`，**静态文件更新即时生效无需重启 pm2**；② 后台订单详情新增「核对微信支付状态」按钮（`GET /admin-api/orders/:orderSn/check-wxpay`，**只读不改任何数据**）：调微信查单 + 退款查询与本地对比，逐条列出不一致（微信已退款但本地未标记——商户平台手工退款场景、回调丢失、金额不符等），退款明细**只传 `out_trade_no` 查询**（传我们的 `R+订单号` 规则查不到手工退款） | 协议页给运营自助更新（宝塔直接编辑服务器文件保存即生效）。核对按钮源于 `PP20261011204940` 那笔手工退款教训。实测：四类真实订单核对全对（已退款/已支付/未支付/不存在），stub 单测覆盖手工退款、回调丢失、金额不符、完全一致四分支（金额不符分支连 stub 单位错误都被正确抓出——total_fee 按分换算）。`/queryWxPayOrder` 保持不动：小程序联调文档在用且无 token 可加，管理端改用新接口 |
| v1.7.9 | 2026-11-02 | **支付流水 + 后台支付管理（不用登微信后台看流水）**：① 新建 `pp_pay_record` 流水表（`scripts/migrate_pay_record.js` 幂等建表，`--backfill` 回填历史）——**支付与退款共用一张表**，`record_type` 区分，差异字段存 `raw`(JSON)，幂等键 `(record_type,out_trade_no)` 与 `out_refund_no`；② 新增微信接口 **`/pay/refundquery` 退款查询**（`pay.js.refundQuery`，不需证书，兼容 V2 的 `xxx_0` 返回形式）；③ **三处埋点**写流水：支付回调 `callback`、查单兜底 `check`、退款成功 `refund`，写入失败均不阻断主流程；④ 后台接口：流水列表（类型/状态/关键词/时间筛选 + 收款退款汇总）、详情（含微信原始返回）、**手动同步**（支付调查单、退款调退款查询）、导出 Excel、按订单查资金流水；⑤ 后台新增「支付管理」页（收款/退款/净收入三个统计卡片 + 抽屉详情 + raw 展示） | **此前的数据缺口**：退款完全没有流水（`markOrderRefunded` 只改状态），退了多少/何时退的/到账没到本地一概查不到。设计原则：**本地库为主，微信侧只作核对源**，列表不实时调微信（避免慢与限频），人点「同步」才调。**后台同步只更新流水、不改订单状态**，避免与回调/兜底两条口径打架。统计口径：收款含 `SUCCESS` 与 `REFUND`（曾收过款后来退了，不能算 0），净收入=收款−退款，为负需人工核对。实测：回填 11 条历史流水（支付 6 / 退款 5）；列表、筛选（类型/关键词/时间范围）、详情、手动同步（支付与退款各一次，均返回最新状态）、导出 xlsx 全部通过；订单 `PP20261017215847` 显示「支付 301 → 退款 301」完整链路。⚠️ **回填时发现并已修正一处真实数据不一致**：订单 `PP20261011204940`（￥7）库内 `pay_status=1 已支付`，但微信查单 `trade_state=REFUND`。用我们自己的 `R+订单号` 查退款返回 `REFUNDNOTEXIST`，**改为只传 `out_trade_no` 查到真实退款**：`out_refund_no=6561289372026101176676335681791724444`（一串微信自动生成的数字，非我们的规则）、`refund_id=50300808922026101140272815535`、￥7、`SUCCESS`、2026-10-11 21:14:36 退到「支付用户零钱」——**该笔是在微信商户平台手工退的，未走我们的接口**，故本地既无流水、订单状态也没变。经用户确认后已修正：补记退款流水 + `markOrderRefunded` 置 `pay_status=2`（净收入口径由 7 归零，收款 968 = 退款 968）。据此改造回填脚本：**对所有已支付订单都查退款（不传 `out_refund_no`，否则用我们的规则查不到手工退款）**，发现「微信已退款但库内 `pay_status≠2`」时打印 `⚠️ 不一致` 告警并给出修正 SQL，**脚本本身不自动改订单状态**——动钱的事必须人工确认。重跑验证幂等（仍 12 条、无新增告警）。admin-web 构建通过 |
| v1.7.8 | 2026-11-02 | **支付查单兜底（资金安全第二道保险）**：① 新增定时任务 `src/tasks/checkPendingPayments.js`（PM2 应用 `pangpai-paycheck`，启动即跑一轮 + 每 2 分钟一轮），扫「未支付且未取消、账龄 3 分钟~24 小时」的订单 → 调微信 `/pay/orderquery` → 微信侧 `trade_state=SUCCESS` 则**复用回调同一落库路径** `markOrderPaid` 补写订单状态，并补发企微通知（标注「支付回调补单」）；② `order.model` 新增 `listUnpaidOrders`（窗口 + 上限可控）；③ `ecosystem.config.cjs` 新增 `pangpai-paycheck` 应用，`package.json` 新增 `task:paycheck` / `task:paycheck:once`（单轮 dry-run） | **为什么要做**：订单支付状态唯一真源是微信回调，回调因网络抖动/部署重启丢失时会出现「钱付了、订单仍待支付」——资金与客诉风险。此前 `src/tasks` 只有 token 刷新，无任何查单兜底。安全边界：金额核验与回调同口径（对不上**绝不落库**）、落库幂等、单条失败不影响整轮、只扫 24h 内未取消订单。实测：用真实订单号验证微信查单返回字段（`return_code`/`result_code`/`trade_state`/`total_fee`，未支付时无 `transaction_id`/`time_end`）；六个分支单测全通（通信失败/ORDERNOTEXIST/NOTPAY→跳过，金额不符→拒绝落库，金额符→补单成功，dry-run→不落库）；三种启动模式（单轮/dry-run/常驻）均正常。⚠️ 联调时用例 5 曾真实写入一笔生产订单 `PP20261018170534` 的支付状态，**已还原**（`pay_status=0`/`transaction_id=NULL`/`pay_time=NULL`，待支付总数仍为 40）。本地环境企微通知因 IP 白名单被拒（errcode 60020），已 try/catch 不影响主流程，**服务器需确认企微可信 IP 已配置** |
| v1.7.7 | 2026-11-02 | **优惠券「已过期」状态——用派生状态，不落库**：① `pp_coupon` / `pp_user_coupon` **不动表结构**，新增只读派生状态：用户券 `state`（`usable`/`not_start`/**`expired`**/`used`/`invalid`）+ `state_text`；批次 `runtime_status`（`not_start`/`active`/**`claim_ended` 已停止领取**/**`ended` 已结束**/`discarded`）+ `runtime_status_text`。判定集中在 `coupon.model` 的 `deriveUserCouponState` / `deriveCouponRuntimeStatus`，以服务端当前时间为准；② **虚拟状态筛选**：接口 `status` 参数同时接受数字与字符串，`expired` 翻译为 `status=0 AND use_end_time < NOW()` 等，**旧数字值完全兼容**；③ C 端券包默认仍返回过期券（**保留置灰**），服务端按「可用在前、临期优先，过期与终态靠后」排序；④ 后台批次列表状态列显示派生状态（与库内 `status` 不一致时补注「（库内：活动中）」避免运营困惑），筛选下拉增加「已结束（过期）/ 已停止领取」；⑤ 领券记录页状态列显示「已过期」，筛选增加 可用/未生效/已过期，统计卡片新增**「已过期张数」「过期未核销金额」** | **设计取舍**：过期是时间的函数而非动作，写进 status 需定时任务翻转（多一个要盯的进程），且会覆盖「过期前是未使用还是被作废」这一信息——财务复盘要的正是这个区分，故**不引入定时任务**。实测 9 项全通：批次 `CP2026102697RDZE`（使用期 10-27 已过）正确派生为「已结束」，虚拟筛选 `ended`=1、`active`=1、旧值 `status=1`=2（兼容）；用户券 uid=250 已过期券 `state=expired`、`usable=false`；领券记录 summary 新增 `expired=2 / expiredAmount=40`；C 端筛 `expired`=1、`usable`=0、旧值 `status=0`=1。admin-web 构建通过 |
| v1.7.6 | 2026-11-01 | **车辆详情页数据层（轮播图 / 标签 / 配置参数）**：① `pp_car` 新增三个 JSON 列 —— `images`（轮播图数组，最多 8 张，第 1 张为列表与详情主图）、`tags`（标签数组，最多 6 个，单条 ≤10 字）、`config`（配置参数键值对，最多 20 项），迁移脚本 `scripts/migrate_car_detail_fields.js`（幂等、先建库内备份表、中文注释显式 `SET NAMES utf8mb4`、并把 24 辆存量车的 `image_url` 回填为 `images` 第 1 张）；② 新增 `src/services/car.service.js` 统一做三个字段的**归一化**（后台写入与 C 端读取共用，脏数据/非法 URL/超量/重复全部收敛），C 端 `/getCarList`、`/getCarInfo` 与后台车辆列表均返回归一化结果，`images` 为空时自动回退 `[image_url]`；③ 后台车辆 CRUD 支持这三个字段，**更新采用动态 SET——只更新 payload 里显式传了的字段**（列表页「排序值即时保存」等整行提交不会误清空运营已录入内容）；保存时若传了 `images`，自动把 `image_url` 同步为 `images[0]`；④ `admin-web` 车辆表单新增：多图上传（≤5MB/张，缩略图列表 + 删除 + 「设为主图」）、标签动态添加/删除、配置参数键值对增删 | 面向小程序**车辆详情页**（列表页与结算页之间）。**用户评价本期不做**（库内无评价表，下一版再建 `pp_car_review`）。实测 6 项全通：创建带 2 图/2 标签/2 配置的测试车 → C 端详情正确返回；整行更新（不带这三个字段）后内容**未被清空**；改为 1 标签 + 空配置后正确落库；主图自动同步为 `images[0]`；逗号串与非法 URL 等脏入参被正确过滤；测试车已删除（车辆总数 24→25→24）。admin-web 构建通过 |
| v1.7.5 | 2026-11-01 | **新增 C 端车辆详情接口 `GET /getCarInfo`**：① 入参 `carId` 必填、**`uid` 选填**（未登录也能看车，传了才附带券后价），另可选 `pickUpTime`/`returnTime`/`insuranceLevel`/`driver_price`；② 返回车辆对象 `data` + 与 `/checkout` 同构的计价明细（`rentDay`、`total_price`、`discount_price`、**`pay_amount`**）+ `best_coupon`/`coupon_count`/`has_coupon`；③ 券后价口径：复用 `coupon.service.pickBestCoupon`（新增）挑出「本次可用且抵扣最多」的一张券（面额相同时优先临期券），**只试算展示、不锁定不核销**，沿用「默认不选券」规则；可用性判定复用 `validateCoupon`，与结算/下单同口径（含「订单金额需大于券面额」门槛）；④ 未传取还车时间时按**默认 1 天**算参考价（详情页通常还没选日期）；⑤ 下架车辆返回 `400 该车辆已下架，暂不可预订`，与 `/createOrder` 一致；⑥ 新增 `src/utils/time.js` 的 `formatDateTime`（东八区 `YYYY-MM-DD HH:mm:ss`），券有效期等时间字段不再吐 ISO UTC 串 | 实测：无 uid 与带 uid 均返回 `code:200`（carId=1 参考价 349 = 199 租金 + 100 保险 + 50 整备，`rentDay=1`）；缺参/车辆不存在/下架分别返回明确 400；计价口径验证 2 天 648、用 20 元券 → 抵扣 20 / 实付 628；券已过期（库内仅有的两张券 10-27 到期）与匿名访问均正确返回 `coupon_count=0`、`best_coupon=null`。**本次为只读实现，未写入任何生产数据**。文档已同步接口文档 §2.2 与两份 Change Log |
| v1.7.4 | 2026-10-31 | **建立「可跨账号/跨工具」的 AI 协作契约（项目记忆入库）**：① 新增根目录 `AGENTS.md`——任何时候进入仓库的第一入口，含五条红线（不自动 commit/push、迭代必须同步需求文档与 Change Log、涉 C 端接口联动接口文档、金额以 `pay_amount` 为准、计价唯一真源）、环境速查、目录地图、业务口径、编码约定、12 条已知坑、按任务类型的检查清单；CodeBuddy 在无 `CODEBUDDY.md` 时自动加载，Cursor/Claude Code/Codex 通用；② 新增 `.codebuddy/rules/pangpai-car-core/RULE.mdc`（`alwaysApply`，常驻红线）与 `.codebuddy/rules/pangpai-car-docs/RULE.mdc`（按需，文档收尾工作流）；③ 新增 `docs/ai-context.md`：深度技术上下文（装配顺序、用户链路、计价、下单支付、退款、优惠券、后台层、基础设施、管理前端、脚本/部署/配置、13 条缺陷明细） | **动因**：项目约定此前只挂在 AI 的账号记忆上，用户更换 CodeBuddy 账号后全部丢失（当天就出现了「擅自想 commit、忘记更新需求文档」的情况）。三份文件随仓库走，是唯一可靠载体。**内容均经代码核实**：调研过程中主动否掉了一条错误结论（子代理称「不存在 `@vueuse/core` 依赖」，实为 `admin-web/package-lock.json` 命中 9 处、`node_modules/@vueuse` 实体存在，EBADENGINE 警告属实）；并抽查复核了订单号生成（`genOrderSn` 确为 `'PP'+YYYYMMDDHHmmss`）、本地建表脚本缺券表（`local-dev-init.sql` 中 `pp_coupon` 命中数为 0）、整备费不乘天数三项关键事实。本次仅新增文档与规则文件，**未改动任何业务代码** |
| v1.7.4 | 2026-10-31 | **后台新增车辆支持图片上传**：① 新增 `src/middlewares/carUpload.js`（multer 实例 + 错误包装中间件）与 `src/controllers/admin/upload.controller.js`，路由 `POST /admin-api/upload/car-image` 挂在 `adminAuth` 之后（需 JWT）；② 落盘 `uploads/car_img`（`UPLOAD_DIR` 子目录，`mkdirSync recursive` 随服务启动自动创建，**部署无需手工建目录**）；③ 限制：仅 jpg/png/webp（MIME 白名单，后缀不信任 `originalname`）、单张 ≤5MB、一次一张，文件名 `car-<时间戳>-<8位随机>.<ext>`；④ 超限 / 格式不符 / 字段名不为 `file` 统一转 HTTP 400 + `{code:400,msg}`——multer 错误不走 Express 异常链，不包装会被全局异常吞成 500；⑤ `Cars.vue` 表单「图片URL」改为「车辆图片」：`el-upload` 选图 + 缩略图预览（可点击放大）+ **保留手填地址输入框**，成功后回填 `image_url` | **边界**：原有的公开 `POST /upload`（无鉴权、落 `uploads` 根、10MB）保持不动，身份证等 C 端上传仍走它，互不影响。实测 4 项全通：正常 PNG 返回 `https://pangpai-car.com/images/car_img/car-20261030185815-2a9e4854.png` 且落盘成功；6MB 文件被拒（「图片大小不能超过 5MB」）；gif 被拒（「仅支持 jpg / png / webp 格式的图片」）；字段名错误被拒（「上传字段名必须为 file」）。并已验证「删掉整个 uploads 后仅做一次 `require('./src/routes')`」即可重建 `uploads` 与 `uploads/car_img`。admin-web 构建通过 |
| v1.7.4 | 2026-10-31 | **修复后台优惠券时间渲染为 ISO UTC 原始串**：`Coupons.vue` 的「领取时间 / 使用时间」两列、`CouponRecords.vue` 顶部「批次信息」的领取/使用时间，此前直接打印 MySQL `DATETIME` 序列化出来的 ISO UTC 串（如 `2026-10-25T16:00:00.000Z`），运营看不懂；统一接入 `src/utils/format.js` 的 `formatDateTime`（东八区 `YYYY-MM-DD HH:mm:ss`）。**连带修复编辑弹窗回显**：`openForm` 原先把 ISO 串直接赋给 `value-format="YYYY-MM-DD HH:mm:ss"` 的 `el-date-picker`，选择器无法解析（Invalid Date / 显示为空），现回显前同样先格式化 | 属于「既有工具漏用」的补齐——`formatDateTime` 早已用于订单/用户/车辆列表，优惠券这两个页面是 v1.7.3 新增时漏掉的。补齐后**后台所有时间列口径一致**。无 lint 错误，admin-web 构建通过 |
| v1.7.3 | 2026-10-27 | **优惠券管理新增「领券记录」二级页面**：① 新增 `coupon.model.getUserCouponRecords()`——按批次查 `pp_user_coupon` 并 `LEFT JOIN pp_user` 带出昵称/手机号，支持 `status`（未使用/已使用/已作废）与 `keyword`（券码/手机号/昵称/账号名）筛选，同时返回 `summary`（未使用/已使用/已作废数量 + **已核销金额**，即真实让利额）；② 新增后台接口 `GET /admin-api/coupons/:id/records`（**`:id` 是 `pp_coupon` 数字主键而非批次号**），返回 `{coupon, list, total, summary}`；③ 新增前端页面 `admin-web/src/views/CouponRecords.vue` 与路由 `coupons/:id/records`，批次列表操作列加「领券记录」入口，页面含批次信息、统计卡片、筛选与明细表（券码/领取用户/第几张/面额/状态/领取时间/使用时间/关联订单号/有效期） | 实测 12 项全通：① 端到端 HTTP 验证（临时 Express 挂真实 admin 路由 + JWT）——正常路径、未鉴权 401、批次不存在 404、状态与关键词筛选透传、既有批次列表接口未受影响；② 数据层验证——总数与三状态之和一致（`0+1+0=1`）、券码精确查 1 条、无结果返回 0、不存在的批次返回空且 summary 全 0。**踩坑记录**：批次的数字主键 `id` 与批次号 `coupon_id` 是两个东西，最初把 `:id` 直接当批次号去关联 `pp_user_coupon.coupon_id`，会导致任何批次都查不到记录；已修正为「先查批次取 coupon_id」并写入文档易错点。admin-web 构建通过 |
| v1.7.3 | 2026-10-27 | **管理后台金额口径补齐 + 修复后台退款按原价退的 bug**：① **修复**：后台「订单退款」弹窗里标着「实付金额」的字段实际取的是 `total_price`（订单原价），且打开时**默认退款金额就填原价**——用券订单点退款会按原价退，被 `refund.service` 拦截而失败（服务端早有 `refundFee > pay_amount` 校验，不会真的多退钱，但功能不可用且文案误导）。现改为默认/上限均取 `pay_amount`，并加提示与前端二次校验；② 订单列表「总价」改名「订单原价」，新增「优惠券 / 优惠金额 / 实付金额」三列，详情页同步补三项；③ 概览「今日概览」拆为「订单原价 GMV / 优惠券抵扣 / 实收金额」，近 7 日表格与合计同步拆三口径（`totalAmount`/`discountAmount`/`paidAmount`）；④ 导出 Excel 新增「优惠金额 / 实付金额 / 优惠券名称 / 优惠券码」；⑤ 后台列表/详情/导出通过 `LEFT JOIN pp_user_coupon` 补齐券名（`pp_order` 只存 `coupon_sn`，此前后台拿不到券名只能显示兜底文案） | 实测：① 概览与近 7 日均返回三口径且「原价−抵扣=实付」成立；② 46 单抽样金额等式全部成立；③ 后台列表能 JOIN 出券名（真实数据样例：`PP20261027001319` → 「新用户立减20」，原价 29 / 抵扣 20 / 实付 9）；④ 模拟后台误传原价 648（实付 598）→ 被拦截并提示「订单实付 ￥598」，按 598 传则通过金额校验进入微信流程。admin-web 构建通过 |
| v1.7.3 | 2026-10-26 | **Change Log 排序治理**：① 两份文档的 Change Log **统一改为倒序**（最新版本在最上面）——此前是「追加到末尾」的升序写法与「新条目插到最上面」两种方向混用，表格读起来像版本倒着走，前端同学无法判断哪个是最新口径；② 清理接口文档 Change Log 中混进的**多余分隔行**（把表格从中间截成了两截，看起来像两个独立表）；③ 新增 `scripts/sort_changelog.js`（默认降序，`asc` 切回升序），同版本多条原样保持相对顺序，脚本按 semver 比较版本号，同版本的多条保持原有相对顺序，解析不到版本号的行留在末尾，不会丢失 | Change Log 新增条目直接写在表格**首行**，写完跑一次 `sort_changelog.js` 即可；不要再追加到末尾 |
| v1.7.3 | 2026-10-26 | **文档可读性整理**：① 两份文档都加了「目录」（全部锚点已校验可跳转），需求文档开头新增「文档地图」表格说明本文与接口文档的分工与交叉索引；② 修正接口文档章节编号冲突（新增的优惠券原误编为 `4.5`，与「查询支付结果」重号，改为 `4.8` 并降级为第 4 章下的三级小节）；③ 新增 `scripts/gen_docs_toc.js`（`check`/`update`/`print` 三个子命令），按 GitHub slug 规则生成锚点，**避免手工写目录导致链接失效**（初版手写的 5 条锚点全部跳不过去，已由工具修正）；④ 新增 `docs/prompt-for-miniprogram-agent.md`（给小程序开发 agent 的派活模板，含金额口径、优惠券流程、手机号必填等硬约束） | 目录锚点请勿手改，新增或改名章节后跑 `update` 即可。两份文档继续保持**拆开**：见「文档地图」中的分工与给外部开发者时的取用建议 |
| v1.7.3 | 2026-10-26 | **订单联系电话 `contact_phone` 改为必填强校验**：提交订单前校验（未填/空/`"undefined"`/`"null"` → `400 请填写联系人手机号`；位数不对或号段非法 → `400 联系人手机号格式不正确…`），正则 `^1[3-9]\d{9}$`；入参先规范化（`trim`、去空格连字符、去 `+86`/`86` 前缀）后统一落库 11 位纯数字。校验规则抽到新增的 `src/utils/validate.js`，`/checkout` 只规范化不强拦（结算页刚打开时用户还没填），`/createOrder` 做最终拦截 | **背景**：此前完全无校验，前端漏填时把空值/`"undefined"` 直接落库，历史 45 单中 35 单为空号，门店无法联系用车人。实测 13 项全通（5 种合法写法均能下单且落库为 `13800138000`，8 种非法输入全部被拒） |
| v1.7.3 | 2026-10-25 | **用券规则补充**（用户追加的两条）：① **订单金额 ≤ 券面额 → 该券不可用**（券包置灰 + `/checkout` 与 `/createOrder` 均拒绝并给出原因），使用时要求订单金额**严格大于**面额，从源头杜绝 0 元支付；② **默认不使用优惠券**，必须由用户在结算页**手动选择**（服务端不自动替用户选券、不推荐最大面额券）；③ `/getUserCoupons` 新增可选参数 `amount`（本次订单原价），据此计算 `usable` 并新增 `unusable_reason`（已使用/已作废/已过期/不适用于当前车辆/订单金额需大于优惠券面额）；④ 结算与下单改为「先按不用券算原价 → 校验券（含金额门槛）→ 带券重算实付」，两处口径一致 | 实测 7 项全通：默认不带券时优惠 0、实付=原价；传金额后超大面额券被置灰且结算/下单均被拒（券不会被白白核销）；小额券正常抵扣 648→598 并核销。测试数据已清理 |
| v1.7.3 | 2026-10-25 | **新增优惠券功能**：① 新增 `pp_coupon`（批次：面额/库存/领取时间/使用时间/使用范围/每人限领限用/成本承担方预留/状态）与 `pp_user_coupon`（用户券：`coupon_sn` 唯一券码 + 面额范围有效期**快照**）；② `pp_order` 新增 `coupon_id`/`coupon_sn`/`discount_price`/`pay_amount` 四列，历史 45 单 `pay_amount` 已回填为 `total_price`；③ 后台接口 `GET/POST /admin-api/coupons`、`GET/PUT /admin-api/coupons/:id`、`PUT :id/status`（未开始→活动中→已废弃，废弃不可逆且**连带作废用户已领未用券**；活动中只允许追加库存）；④ C 端 `GET /getCouponList`、`POST /receiveCoupon`、`GET /getUserCoupons`；⑤ `/checkout` 与 `/createOrder` 支持 `couponSn`（每单一张），校验归属/状态/有效期/适用范围后**原子核销**，建单失败自动退券；⑥ **资金链路校准**：`/getWxPay` 服务端校验金额等于订单 `pay_amount`×100（此前完全信任前端）、支付回调核验与微信退款 `total_fee` 均改用 `pay_amount`（**不改则券订单退款必然失败**）；⑦ 退款成功后券退回账户（券已过期则不退回）；⑧ 导出 Excel 增加「优惠券金额/实付金额/优惠券码」三列，订单详情返回 `coupon_name`/`coupon_amount`，概览新增实收与优惠统计；⑨ admin-web 新增「优惠券管理」页；⑩ 迁移脚本 `scripts/migrate_coupon.js`（幂等，含 `SET NAMES utf8mb4` 防注释乱码） | 金额口径：**`total_price` 保持原价不变**，新增 `discount_price`（抵扣）与 `pay_amount`（实付），GMV/报表口径不受影响。实测 12 步全通：建批次→可领列表→领券拿券码→重复领被拒→库存 10→9→券包→结算（原价648-优惠50=实付598）→下单核销→重复使用被拒→退款退券→批次废弃连带作废，测试数据已清理。**边界**：券抵扣后应付=0 暂不支持（返回 400 并退券）。**待前端接入**：首页 banner 领券、结算页选券（`pay_amount` 是新的支付金额口径） |
| v1.7.2 | 2026-10-25 | **登录/注册语义修正**：`GET /tryLogin` 的 `202` 原字段 `needPhone:true` 名不副实——它表达的是「**该微信尚未注册账号**」，手机号只是注册手段而非目的。现改为 `{code:202, msg:'该微信尚未注册账号，请先注册', needRegister:true, registerBy:'phone'}`，其中 `needRegister` 为主语义（有没有账号）、`registerBy` 说明注册方式（当前固定 `phone`，未来加验证码等方式只扩展该字段、202 语义不变），`needPhone` 保留为等价兼容字段。文档侧把流程拆清为「登录 = `/tryLogin`（查有没有账号）／注册 = `/loginByPhone`（建号并绑定）」 | 接口路径与 200/202 状态码不变，仅响应字段与文案调整，前端已按 `needPhone` 接入的不受影响；建议前端文案改为「请先注册 / 还没有账号」而非「请填写手机号」 |
| v1.7.1 | 2026-10-25 | 明确订单联系电话口径（**无代码改动，后端行为本就如此，仅固化约定**）：结算页的 `contact_phone` **由用户手工填写**，服务端**不做任何默认值填充**（不会用 `pp_user.phone` 兜底），前端也不要拿账号手机号自动回填——账号手机号是登录凭证，可能与本次实际用车人不同（代人订车/公司用车）。文档同步至需求文档 2.2 节与小程序接口文档 `/checkout`、`/createOrder` 两处 | 前端结算页保持手填输入框、不做默认回填即可；**注意**：后端当前不校验格式，请前端保证传 11 位手机号、不传空值或 `"undefined"` 字符串（历史上 45 笔订单中 35 笔因此为空号码）。如需要后端强校验（非法号码返回 400）可另行提出 |
| v1.7.0 | 2026-10-25 | 文档同步（无代码改动）：① `docs/requirements.md` 2.1 节补全登录流程——**A 新用户**（`wx.login` → `/getOpenid` → `/tryLogin` 收 202 → 手机号授权 → `/loginByPhone`）、**B 老用户**（`/tryLogin` 收 200 直接进，行为不变）、**C 换设备/换微信**（同号回落原 uid）、**D 登录后完整业务调用链**（选车→结算→下单→支付→订单→取消/退款），全部以「步骤 + 接口 + 返回」表格化；② `docs/api-for-miniprogram.md` 新增 **1.0 登录流程总览**（ASCII 时序图 + 四张调用顺序表），联调自测清单拆为老用户/新用户/换号验证/补手机号四条；③ 顺带修正：数据库设计一节由 `adp_user`/`adp_user_auth` 改为 `pp_user`/`pp_user_auth` 并标注 `uk_phone`，接口文档适用版本更新为 v1.7.0 | 便于后续维护与前端接入；判断新老用户只看 `/tryLogin` 的 code：200=已注册，202=未注册需手机号授权 |
| v1.7.0 | 2026-10-25 | **账号体系改为手机号为准（注册流程重构）**：① `pp_user.phone` 加唯一索引 `uk_phone`（v1.7.0 起手机号为账号唯一标识）；② `/tryLogin` 由「openid 自动注册」改为 **只查不注册**——已绑定返回用户行，未绑定返回 `202 + needPhone:true`；③ 新增注册主入口 `GET /loginByPhone`（入参 `code` = `<button open-type="getPhoneNumber">` 回调 code + 可选 `openid`/`unionid`）：服务端调微信 `wxa/business/getuserphonenumber` 换真实手机号 → 手机号已存在则登录该账号、不存在则新建 → 绑定 openid/unionid → 返回 uid；④ 新增 `GET /bindPhone`（已登录用户补填手机号，老用户可选接入）；⑤ 修复孤儿授权 bug：`pp_user` 行被删后授权行残留会让该 openid 永久登录失败且每次新建空账号（唯一键冲突被 catch 吞掉），现 `/tryLogin` 自动清理孤儿行；⑥ 迁移脚本 `scripts/migrate_user_phone_unique.js`（清理孤儿授权行并离线导出、空串转 NULL、重复号检测、加唯一索引，幂等） | 实测：未绑定 openid 返回 202 且不再建号；假 code 调 `/loginByPhone` 微信返 40029，接口返回明确 400 不 5xx；主流程用例——同号重复登录落同一 uid、同号换微信补绑新 openid、openid 已绑他号返回 -2、补号与他人号码冲突返回 -2（测试数据已清理，用户数 66→66）；老用户（已 openid 绑定、无手机号）登录不受影响。**待前端配合**：登录页改为「202 → 手机号授权按钮 → /loginByPhone」，微信手机号能力按次计费（约 0.03 元/次）且需非个人主体 |
| v1.6.20 | 2026-10-25 | 库内备份表清理（纯运维，无代码改动）：删除全部 5 张历史迁移备份表 `adp_admin_user_bak_20261024`(1)、`adp_user_bak_20261024`(63)、`adp_user_auth_bak_20261024`(62)、`pp_car_bak_20261025`(24)、`pp_order_bak_20261025`(45)；删除前已离线导出完整 `CREATE TABLE` + `INSERT` 快照至 `~/pp_backup_tables_20261025.sql`（35KB，工作区外、不入库）；数据库设计一节新增「表命名与清理约定」 | 这些表为一次性快照、业务代码零引用（已全量 grep 确认），删除不影响任何流程；线下库现仅剩 13 张业务/历史表。`adp_*` 系列为其他项目在用，**不可删** |
| v1.6.19 | 2026-10-25 | 订单整备费列位置归位：① 线上 `pp_order.clean_price` 由表末（v1.6.18 `ADD COLUMN` 默认追加在最后）经 `MODIFY COLUMN ... AFTER driver_total_price` 调整至「司机服务费合计」之后、「订单总价」之前，使费用字段按「租金→保险→司机→整备费→总价」的物理顺序与计价公式一致；② 新增幂等迁移脚本 `scripts/migrate_order_clean_price_position.js`（先建库内备份表 → 从 `information_schema` 读出原类型/非空/默认值/**中文注释**再 MODIFY，避免注释丢失或乱码 → 前后校验行数与整备费合计）；③ `scripts/local-dev-init.sql` 同步列顺序并将默认值对齐线上（1 → 0） | 代码零影响：下单 INSERT 用显式列名、查询与导出均按字段名取值，不依赖物理列顺序；实测 45 行订单、整备费合计 45.00 前后一致，列位置 24→13、中文注释保留 |
| v1.6.18 | 2026-10-25 | **费用改为按车辆配置**：① `pp_car` 新增 `clean_price`（整备费，一次性不乘天数）、`insurance_price_l1`/`insurance_price_l2`（两档保险日单价），迁移脚本 `scripts/migrate_car_fee_fields.js` 给现有 24 辆车填默认值 50 / 100 / 200（先备份）；② `pp_order` 新增 `clean_price` **快照列**（此前整备费从未落库），历史 45 笔订单回填为原固定值 1 元；③ 计价服务改为读取车辆配置，**保险费必买、二选一**（缺省低档 l1），旧参 `insurancePrice` 兼容映射为档位（≥100 视为 l2）但金额以车辆配置为准；④ 计价公式为 `日租金×天数 + 保险日单价×天数 + 司机日单价×天数 + 整备费`；⑤ 新增 `GET /getCarFee`、`/getInsurancePrice?carId=` 按车返回费用；⑥ 后台车辆管理表单/列表支持配置这三项费用；⑦ 订单列表与导出 Excel 的「整备费」取真实落库值 | 实测：低档 2 天 `4600+200+50=4850`、高档 `4600+400+50=5050`、加司机 `+800=5850`；后台把某车改为整备 88 / 保险 66 后结算立即变为 4820 ✅；构造 `total_price=0.01 & rentDay=99` 的下单请求，落库为服务端算的 rent_day=2、clean_price=88、total_price=4820（测试订单已删除，配置已还原）；旧参兼容：insurancePrice=120→l2、=1→l1 |
| v1.6.17 | 2026-10-25 | C 端 `GET /getOrderList` 支持状态筛选：新增可选入参 `pay_status` / `order_status`（支持逗号分隔多值，白名单外的值忽略），筛选在 **SQL 层**完成（全局筛选而非当前页过滤），不传参数行为与旧版完全一致；响应新增可选字段 `total` / `page` / `pageSize` 便于前端分页 | 实测：不传筛选 total=4 与旧版一致；`order_status=4` / `order_status=2,4` / `pay_status=1,2` 均命中 4 条；组合 `pay_status=2&order_status=4` 命中 3 条、`pay_status=1&order_status=4` 命中 1 条；非法值 `pay_status=99` 被忽略（total 仍为 4）；页码为 0 仍返回 201 |
| v1.6.16 | 2026-10-24 | 新增 C 端「取消订单」接口 `POST /cancelOrder`：仅用于**未支付**订单（不涉及资金），校验归属 uid + `pay_status=0` + `order_status=0`，通过后仅置 `order_status=4`（已取消）；`order.model.cancelUnpaidOrder` 的 UPDATE 条件自带状态断言，杜绝并发下误改已支付/已取车订单。与 `/cancelRefund` 按支付状态严格分流，避免「钱没退、单却取消了」 | 实测：未支付待取车 → 200 已取消且落库 order_status=4；重复取消 → 400 订单已取消；已支付订单 → 400 引导走 /cancelRefund；未支付已取车 → 400 提示联系客服；越权 403；不存在 404；缺参 400（测试订单已删除） |
| v1.6.15 | 2026-10-24 | 用户体系拆分：庞派用户从共用表 `adp_user` / `adp_user_auth` / `adp_admin_user` 迁出到独立的 `pp_user` / `pp_user_auth` / `pp_admin_user`，adp_ 表保留给其他项目且**数据未做任何删除或修改**。迁移脚本 `scripts/migrate_user_to_pp.js`（先建库内备份表 + 导出离线 SQL，再 `CREATE TABLE ... LIKE` 建新表，按「有 pp 授权 ∪ 被 pp_order/pp_driver 引用」的口径迁移并**保留原主键 id**，幂等可重复执行补迁窗口期数据，最后校正 AUTO_INCREMENT）。代码侧替换 `user.model.js`（6 处 SQL）与 `admin.model.js`（11 处 SQL），`local-dev-init.sql` 同步改为建 pp_ 表 | 实测：备份表 63/62/1 行；迁入 pp_user 62 行、pp_user_auth 62 行、pp_admin_user 1 行；订单 7/45、驾驶证 1/2 关联成功（未关联的 uid 61/123 在**旧表本来就不存在**，属历史孤儿数据，非迁移丢失）；后台登录、用户列表、订单详情 join、小程序 openid 登录/新注册 全部正常 |
| v1.6.14 | 2026-10-18 | 补齐后台订单的费用与支付明细：① 订单列表新增「日租金单价、车辆租金合计、保险费单价、保险费合计、司机单价、司机合计、微信支付单号、支付时间」8 列（原有 联系电话/租车天数/总价 保留，原「日租金」改称「日租金单价」）；② 导出 Excel 同步补齐上述字段并新增「整备费」，共 22 列 | 实测：导出全部 44 条 / 22 列，回读校验表头与取值正确（样例 `PP20261017215847`：日租金单价99、租金合计297、保险费单价1/合计3、司机0、总额301、支付单号4500000565…、支付时间2026-10-17 21:58:52）；同时发现数据问题：部分订单 `contact_phone` 为字符串 `"undefined"`（小程序传参缺陷，非导出问题） |
| v1.6.13 | 2026-10-18 | 后台数据能力增强：① 概览新增「近 7 日订单数据」——`admin.model.getRecentOrderStats(7)` 按 `create_time` 统计每日订单数/已支付数/支付金额并补齐无订单日期，`GET /dashboard/stats` 一并返回 `recent7Days{list,summary}`；② 订单管理新增 Excel 导出——新增 `GET /admin-api/orders/export`（`exceljs` 生成 `.xlsx`，冻结表头，时间为可读格式，支付/履约状态输出中文），筛选条件与列表共用 `buildOrderWhere` 保证口径一致，支持 `scope=all` 直接导出全部，上限 20000 条；③ 后台订单页「导出 Excel」下拉按钮提供「按当前筛选条件导出 / 导出全部订单」；`api` 拦截器对 `responseType=blob` 放行以便二进制下载 | 实测：近 7 日返回连续 7 天并给出合计；按 `pay_status=1` 导出 1 条、导出全部 44 条，文件均可被 exceljs 正常解析（表头与首行数据校验通过），Content-Type 与 UTF-8 文件名响应头正确 |
| v1.6.12 | 2026-10-18 | 租用天数与金额口径治理：① 新增 `src/services/pricing.service.js` 作为唯一计价入口——**天数 = 时长÷24h 向上取整且≥1 天**（原为小时比例小数，会少收钱），日租金取 `promotion_day_price`（为空回退 `day_price`），保险/司机按白名单（保险 `0/1/120`、司机 `0/400`）校验；② `/checkout` 与 `/createOrder` 共用该服务，**下单时金额由服务端重算，不再采信前端传价**（修复构造请求改价的漏洞）；③ 校验还车时间须晚于取车时间 | 实测：24h→1 天、25h→2 天、23h→1 天、36h→2 天、49h→3 天；时间倒挂/相同/非法、保险传 9999 均返回 400；构造 `total_price=0.01 & rentDay=99` 的下单请求，落库为服务端算的 rent_day=2 / total_price=4603（测试订单已删除） |
| v1.6.11 | 2026-10-17 | 退款闭环：① 修复 `WechatPayV2.refund/orderQuery/closeOrder/getAppParams` 误用不存在的 `config.appId`（应为 `appid`，否则退款签名参数缺失必然失败），退款增加 `return_code/result_code` 校验与缺证书时的明确报错；② 新增 `src/services/refund.service.js` 统一退款流程——调微信 `secapi/pay/refund`（p12 证书）成功后再由 `order.model.markOrderRefunded` 落库 `pay_status=2`（已退款）+ `order_status=4`（已取消），失败不改状态；③ 管理端 `POST /admin-api/orders/:id/refund`（**不校验订单状态**，支持全额/部分退款）+ 后台订单详情「退款」按钮与弹窗（金额/原因）；④ 小程序端 `POST /cancelRefund`（校验归属 uid + `pay_status=1` + `order_status=0`，仅未取车可退） | 实测：缺证书时返回明确错误不崩溃；C 端 403/400/404 校验均生效；`markOrderRefunded` 落库 pay_status=2、order_status=4 正确（测试后已还原）。**已实测**：对真实已支付订单 `PP20261017215847`（￥301.00）走后台退款，微信返回退款单号 `50302308702026101745339735830`，订单自动置为 `pay_status=2` + `order_status=4`；已退款订单再次发起 C 端退款被拦截为 `400 订单已退款`。**待办：服务器（Node 18+）需部署 PEM 证书** |
| v1.6.11 | 2026-10-17 | 退款证书加载兼容：Node 17+ 的 OpenSSL 3 拒绝微信 p12 的老式 RC2 加密（`Unsupported PKCS12 PFX data`），config 新增 `WX_CERT_PATH`/`WX_KEY_PATH` 与 `hasCert()`，`request()` 改为 **PEM(cert/key) 优先、p12 兜底** | 实测：PEM 方式发起退款，微信受理并返回 `ORDERNOTEXIST`（未支付订单的业务错误），证明证书双向认证与签名链路通；p12 方式在 Node 24 下确认报 RC2 不受支持 |
| v1.6.10 | 2026-10-17 | 后台支持修改订单取车/还车地址：① `admin.model` 新增 `updateOrderAddress(id, {pickup_address?, return_address?})`（动态 SET，支持单字段更新）；② 新增接口 `PUT /admin-api/orders/:id/address`，校验非空 trim、≤100 字符（与 `pp_order` 两列 varchar(100) 一致）；③ `admin-web` 订单详情抽屉底部新增「修改取车/还车地址」按钮 + 弹窗（100 字计数，保存后即时刷新详情与列表） | 实测：双字段更新、仅更新取车地址、空值拦截 400、不存在订单 404 均正常；测试订单(#41)地址已还原 |
| v1.6.9 | 2026-10-17 | 管理后台订单管理增强（纯前端改动，后端接口未变）：① 订单列表新增「用户ID」（`uid`）、「租车天数」（`rent_day`）、「日租金」（`rent_day_price`）三列；② 订单详情抽屉顶部新增车辆图片（`image_url`，`el-image` 点击放大预览，无图片时展示空状态占位）；抽屉宽度 480→520px | 构建通过；已确认订单列表/详情数据含 `uid`、`rent_day`、`rent_day_price`、`image_url` 字段，无需改后端 SQL |
| v1.6.8 | 2026-10-17 | 下单校验车辆上架状态（上下架闭环）：① `order.model.createOrder` 下单前查询车辆，不存在返回 `-2`、已下架（`status≠1`）返回 `-3`；② `order.controller.createOrder` 映射为明确响应：车辆不存在→`400 车辆不存在，无法下单`、已下架→`400 该车辆已下架，暂不可预订`、写入失败→`500`；③ 新增 `docs/api-for-miniprogram.md`（面向小程序前端的完整 C 端接口文档，含 Change Log，后续涉及小程序接口的改动必须同步更新） | 实测：上架车下单成功（订单号 PP20261017174739），下架后同参数下单被拦截；测试订单已删除，订单总数保持 41 |
| v1.6.7 | 2026-10-17 | 车辆上下架 + 排序：① 线上 `pp_car` 新增 `status`（tinyint，1 上架/0 下架，默认 1）与 `sort`（int，1~10000，默认 100）两个字段；② 小程序端 `/getCarList` 仅返回 `status=1` 并按 `sort` 升序；③ 管理端新增 `PUT /admin-api/cars/:id/status` 上下架切换，列表支持 `status` 筛选，新增/编辑支持 `status`、`sort`（sort 校验 1~10000 整数）；④ `admin-web` 车辆页新增排序列（即时保存）、状态开关、上下架筛选与表单项 | 线上 21 辆车默认全部上架 sort=100；实测下架后小程序端列表已隐藏、排序生效、非法 sort(20001) 被拦截；测试后数据已复原 |
| v1.6.6 | 2026-10-17 | 线上 `pp_order` 字段注释修正与补齐：① 修复 v1.5.0 所加注释的编码乱码（当时执行 ALTER 的连接字符集不正确，中文被错误编码写入）；② 23 个字段全部补上中文注释（含枚举含义）；③ `scripts/local-dev-init.sql` 同步为与线上一致 | 已在线上库执行 ALTER 并验证：全部注释正常显示，41 条订单数据无丢失；其余表（`adp_user_auth` 等）注释编码正常无需处理 |
| v1.6.5 | 2026-10-12 | access_token 更新机制双保险：① token 刷新任务纳入 PM2 托管（`ecosystem.config.cjs` 新增应用 `pangpai-token`，日志 `logs/token-*.log`）；② 读取侧新鲜度兜底——`getAccessTokenCached`/新增 `getWorkTokenCached` 在缓存文件缺失**或超过 90 分钟未刷新**时自动重取并落盘（原逻辑只兜底"文件不存在"，任务进程挂掉后过期 token 仍会报 40001） | 实测：将缓存 mtime 改为 2 小时前 → 自动重取 137 位新 token 并更新文件；微信 token 有效期 7200s，与小时级刷新任务余量充足 |
| v1.6.4 | 2026-10-11 | 管理后台时间显示优化：① 新增 `admin-web/src/utils/format.js` 共享 `formatDateTime`（ISO/毫秒时间戳/Date → `YYYY-MM-DD HH:mm:ss` 东八区，空值与 0 显示 `-`）；② 订单列表创建时间、详情支付/取还车/创建时间，车辆列表更新时间，用户列表注册时间、详情注册/授权时间全部接入 | 实测 `2026-10-11T13:13:59.000Z` → `2026-10-11 21:13:59`；Orders 原局部 formatTs 一并收敛到共享工具 |
| v1.6.3 | 2026-10-11 | 管理后台线上部署（方案B，`https://pangpai-car.com/admin`）：① vite `base: '/admin/'` + vue-router `createWebHistory('/admin/')`；② `app.js` 托管 `admin-web/dist`（静态目录 + SPA history 兜底，dist 不存在时仅打印提示不阻断启动）；③ 接口同域相对路径无需跨域/Nginx 配置 | 本地全链路验证通过：/admin/ 200、/admin/orders SPA 兜底 200、assets 200、/admin-api 未带 token 401；服务器需 build + pm2 restart 后生效 |
| v1.6.2 | 2026-10-11 | access_token 读取兜底：① `miniprogram.js` 新增 `getAccessTokenCached()`——缓存文件不存在（ENOENT）时自动调微信接口获取、自动创建 `TOKEN_DIR` 目录并落盘，`/getIdCardInfo` 与 `/getQrCode` 改用该方法；② `getAccessToken()` 增加返回值校验（微信报错时抛出明确异常而非返回 undefined）；③ token 刷新任务写入前自动建目录、企微 token 获取失败时不再把 `undefined` 写入文件 | 本地实测通过（删除 `src/data` 后调用，自动获取 137 位 token 并落盘）；backlog #11 |
| v1.6.1 | 2026-10-07 | 部署配置补齐：① `ecosystem.config.cjs` 入库（PM2 应用 `pangpaicar`，日志 `logs/`）；② 需求文档部署一节重写（后端 PM2/管理后台 Nginx 静态托管/本地开发注意事项） | 无代码逻辑变化 |
| v1.6.0 | 2026-10-07 | 管理后台第一期：① 后端 `/admin-api`：JWT 登录（`adp_admin_user` + bcrypt + `last_login_at`）、概览统计、用户（列表/详情含授权记录与驾驶证）、车辆（CRUD，有关联订单拒删）、订单（列表筛选/详情/履约状态流转）；② 前端 `admin-web/`（Vue3+Vite+Element Plus+Pinia）：登录、概览、订单/车辆/用户三模块页面；③ 新增依赖 `jsonwebtoken`/`bcryptjs`；④ `.env` 新增 `ADMIN_JWT_SECRET`/`ADMIN_JWT_EXPIRES` | 管理端接口全部经本地签发 token 对线上库只读验证通过（47 用户/12 车辆/38 订单）；后台实际部署后端仍需上线；`admin-web` build 产物 362KB CSS + 1MB JS（gzip 350KB） |
| v1.5.0 | 2026-10-07 | 支付回调落库闭环：① 线上 `pp_order` 新增 `pay_status`/`transaction_id`/`pay_time`/`order_status` 四字段；② 回调处理重写：验签 → 订单存在性 → 金额核验（分）→ 幂等落库（`WHERE pay_status=0`）→ 企微通知 → 应答，全分支正确应答（FAIL 触发微信重推）；③ 订单模型新增 `getOrderBySn`/`markOrderPaid` | 已用「合法签名假订单」正向测试（验签通过→订单不存在拒绝）与「篡改签名」反向测试（验签拒绝）验证，未污染生产数据；backlog #1 关闭 |
| v1.4.0 | 2026-10-07 | 多小程序共享用户体系：① 线上新建 `adp_user_auth` 授权表（唯一键 biz_code+openid，预留 unionid/app_id），`adp_user` 47 条存量 openid 全量迁移；② `registerUserByOpenid` 重写为三步查找（openid 命中 → unionid 跨业务关联 → 新建用户+授权）；③ 业务标识 `BIZ_CODE` 入 `.env`；④ `local-dev-init.sql` 同步授权表结构 | 当前两小程序不同开放平台、暂无 unionid，跨业务关联预留通路待开放平台合并后自动生效；线上已用真实 openid 验证登录命中路径（无写入） |
| v1.3.1 | 2026-10-07 | 本地开发环境打通：① 修复 `localhost` DNS 解析失败（aTrust 覆盖 hosts，`DB_HOST` 改用 IP）；② `.env` 切换为直连线上生产库 `mike`（42.194.245.3，用户决策：本地与线上共用生产数据）；③ `scripts/local-dev-init.sql` 按线上真实表结构重写（含种子数据），作为离线备份环境；④ 需求文档数据库一节按线上实际结构校准，补充线上遗留表清单 | `getCarList` 已返回线上 12 辆真实车辆；注意本地调试的写操作（注册/下单/支付）会直接写入生产库 |
| v1.3.0 | 2026-10-07 | 移除 CPS 联盟业务线：① 删除 `services/jd/union.js`、`tasks/fetchJdOrders.js`、`tasks/syncVipGoods.js` 及空目录 `services/jd/`；② 移除 `.env`/`.env.example` 中 `JD_APP_KEY/JD_APP_SECRET`、配置中心 `jd` 段、`npm run task:jd` 脚本；③ 卸载仅联盟使用的 `crypto-js` 依赖；④ 文档同步：删除第 3 节联盟业务、`union_goods` 表与相关 backlog 项，章节重编号 | 项目回归纯租车单一业务；接口无任何变化，冒烟测试与 token 刷新任务验证通过；`union_goods` 表数据未清理，需要时可于数据库手动删除 |
| v1.2.0 | 2026-10-07 | 工程架构重排（标准 Express 分层）：① `src/server/{controller,model,base,admin,task,router}` 与 `src/util` 重组为 `src/{routes,controllers,models,services,middlewares,utils,tasks}`；② 微信 API 双文件合并（`weixin-api.js` + `weixin.api.js` → `services/wechat/miniprogram.js`），小程序码与企微回调控制器合并（`wechat.controller.js`），multer 拆为中间件 + 控制器；③ `src/file` → `src/data`（证书与 token 缓存）；④ 清理死代码：`router/` 遗留、`unionOrder.js`、`union_tran_url.js`、`meituan.js`、`parse_query.js`、`goods.js`；⑤ 任务脚本加 `require.main` 保护并统一命名 | 接口路径与响应结构不变；上传/静态图片/404/异常兜底全链路冒烟测试通过 |
| v1.1.0 | 2026-10-07 | Express 重构 + .env 配置化：① 原生 http switch 路由改为 Express 分层路由（`src/routes/`）；② 全部密钥/DB/路径配置迁入 `.env`（含京东联盟密钥），新增 `.env.example` 模板与 `src/config/index.js` 配置中心；③ 删除明文配置文件与 `image.js`（由 `express.static` 替代）；④ 新增 `asyncHandler` 与全局异常中间件、MySQL 连接错误容错，DB 故障不再击穿进程；⑤ 新挂载查单 `/queryWxPayOrder`、退款 `/applyRefund` 管理端接口；⑥ 修复 `pp_driver` INSERT 占位符 bug；⑦ token 刷新任务支持启动即刷新，路径可配置 | 旧接口路径与响应结构完全兼容；`npm run dev` 可本地启动 |
| v1.0.0 | 2026-10-07 | 基线版本：对存量代码逆向梳理，形成首版需求文档；创建 `.gitignore`；初始化 Git 仓库并推送至 GitHub（pangpai-car-server） | 敏感文件（证书、密钥配置、token 缓存）已排除入库 |
