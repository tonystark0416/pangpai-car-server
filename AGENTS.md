# AGENTS.md — pangpai-car 项目 AI 协作契约

> 本文件是**任何 AI Agent 进入本仓库的第一入口**。换账号、换工具都不会丢。
> CodeBuddy 在无 `CODEBUDDY.md` 时会自动加载本文件全文；Cursor / Claude Code / Codex 等工具同样识别 `AGENTS.md`。
> 深度技术细节见 [`docs/ai-context.md`](docs/ai-context.md)；业务规则与 Change Log 见 [`docs/requirements.md`](docs/requirements.md)。

---

## 0. 先记住这五件事（红线）

1. **不要自动 git commit / git push。** 只有在用户明确说"提交代码"或"推送到 git"时才执行，且推送前必须先说明将要提交的内容。用户偏好自己攒改动，小改动不必频繁提交。
2. **每次迭代必须同步更新 `docs/requirements.md` 正文与 Change Log**，否则按项目负责人定义"视为迭代未完成"。迭代完成 = 代码 + 文档 + Change Log 三者齐全。
3. **涉及 C 端接口的改动，还要同步 `docs/api-for-miniprogram.md`** 及其末尾 Change Log。
4. **金额一律以 `pay_amount`（实付）为准，`total_price` 是原价。** 退款上限、支付核验、统计口径都用前者；新写的代码漏掉 `pay_amount ?? total_price` 兜底会算出 0。
5. **所有计价必须走 `src/services/pricing.service.js`**，禁止在别处重新算一遍价。

---

## 1. 项目一句话

「庞派汽车」是汽车租赁**微信小程序**的后端服务（对外域名 `https://pangpai-car.com`），配套一个 Vue3 管理后台。主线流程：

```
小程序登录/注册 → 登记驾驶证 → 选车 → 结算计价 → 创建订单 → 微信支付 → 企业微信通知员工接单 → 履约（取车/还车/完成）→ 可能的退款
```

## 2. 环境速查

| 项 | 值 |
|---|---|
| 后端 | Express 4，端口 **3002**，`node app.js`（`npm run dev` = `node --watch`） |
| 管理后台 | `admin-web/` Vue3 + Vite + ElementPlus + Pinia，dev **5173**，`base` 与 history 均为 `/admin/` |
| dev 代理 | `/admin-api`、`/images` → `http://127.0.0.1:3002`（见 `admin-web/vite.config.js`） |
| 数据库 | MySQL（mysql2，Promise 封装于 `src/utils/mysql.js`） |
| 生产 | 宝塔 + PM2（应用 `pangpaicar` 主服务、`pangpai-token` 定时刷新 ACCESS_TOKEN），**服务器 Node v24.11.1**（由 `pangpaicar_start.sh` 固定 PATH），Nginx 终结 HTTPS 后反代 3002 |
| 本地 Node | 本机为 v18.18.0（⚠️ element-plus 传递依赖 `@vueuse/core@15` 要求 node>=22，`npm install` 会有 EBADENGINE **警告**，不影响构建与运行，已在 Node 18 下实测 `npm run build` 通过） |

**部署顺序**：`git pull` → `npm install` → `cd admin-web && npm install && npm run build` → `pm2 restart pangpaicar pangpai-token`。
**配置**：根目录 `.env`（不入库），模板 `.env.example`。务必配置 `DB_*`、`WX_*`、`WX_MCH_ID`/`WX_API_KEY`、证书、`ADMIN_JWT_SECRET`、**`IMAGE_BASE_URL`**（为空则图片返回相对路径，小程序 `<image>` 无法识别）。

## 3. 目录地图

```
app.js                  Express 入口：json → /images 静态 → /admin 静态+SPA兜底 → routes → 404 → 全局异常
src/config/index.js     统一配置中心（读 .env，路径自动基于 ROOT 解析）
src/routes/             路由层（薄挂载）；admin/index.js 里 router.use(adminAuth) 之后全部需 JWT
src/controllers/        控制器（参数校验 + 编排）；admin/ 子目录是后台
src/models/             纯 SQL 数据访问
src/services/           第三方服务与领域服务；pricing / refund / coupon / wechat/*
src/middlewares/        asyncHandler、adminAuth、upload（通用）、carUpload（车辆图）
src/utils/              mysql.js、jwt.js、validate.js
src/tasks/              refreshAccessToken.js（独立进程，PM2 托管）
admin-web/src/          views: Login / Dashboard / Orders / Cars / Coupons / CouponRecords / Users
scripts/                一次性迁移脚本（幂等）+ gen_docs_toc.js + sort_changelog.js
uploads/                运行时产物（不入库）：根目录=通用上传；car_img/=后台车辆图片
src/data/               支付证书、access_token 缓存（不入库）
```

分层约定：`routes → controllers → models / services`，横切能力放 `middlewares`，纯工具放 `utils`。
**新增业务的标准落位**：`scripts/migrate_*.js`（建表）→ `models/<模块>.model.js` → `services/<模块>.service.js` → `controllers/<模块>.controller.js` + `controllers/admin/<模块>.controller.js` → `routes/<模块>.routes.js` + `routes/admin/index.js` → `admin-web` 页面 + 路由 + 菜单。

## 4. 关键业务口径

**金额三口径（v1.7.3 起）**

| 字段 | 含义 |
|---|---|
| `total_price` | 订单**原价**（GMV 口径），恒不含券 |
| `discount_price` | 优惠券抵扣额 |
| `pay_amount` | **实付** = 原价 − 抵扣；支付核验与退款上限以此为准 |

**计价公式**（`pricing.service.js`，唯一真源）：天数 = 24h 向上取整且 ≥1；租金 = 促销价或日价 × 天数；保险费 = 日单价 × 天数；司机费同理；**整备费 `clean_price` 一次性，不乘天数**；先算原价再抵扣。

**订单/支付/退款**：订单号 = `PP + yyyyMMddHHmmss`（秒级，无随机位 → 并发会撞）；支付回调手动拼 XML，验签 → 金额核验 → 幂等落库（`WHERE pay_status=0`）→ 企微通知；退款以上面实付金额为上限，**退券时有效期已过则不退回**；退款单号 `R + orderSn`（固定映射，天然幂等，也意味着同一订单无法部分退两次）。

**优惠券**：批次表 `pp_coupon`（另有 `coupon_id` 批次号字符串）与用户券表 `pp_user_coupon`（`coupon_sn` 券码，领券时快照）。领券用 `UPDATE ... WHERE remain_stock > 0` 原子扣库存，限领靠唯一键 `uk_coupon_uid_seq` 兜底。**用券规则：默认不带券（必须用户手选）；订单金额 ≤ 券面额则不可用。**

**上传两套并存（v1.7.4）**：公开 `POST /upload`（无鉴权，`uploads` 根，10MB，身份证等 C 端走这里）；后台 `POST /admin-api/upload/car-image`（JWT，`uploads/car_img`，仅 jpg/png/webp，≤5MB）。目录由 `require` 侧 `mkdirSync(recursive:true)` 随服务启动自动创建，**部署无需手工建目录**。

## 5. 编码约定

- **后台 API 响应** `{code:0, data}` / 失败 `{code:400, msg}`；
- **C 端响应**多为 `{code:200, ...}`（历史包袱，勿统一成 0）。
- **后台鉴权**：无 token 或过期 → HTTP **401** `{code:401,msg}`，由前端拦截器跳登录。
- **时间**：mysql2 未配 `timezone`，`DATETIME` 经 JSON 序列化后是 **ISO UTC 串**，直接吐给前端会差 8 小时 → 后端手工格式化，或前端用 `admin-web/src/utils/format.js` 的 `formatDateTime`。**新写接口别漏掉**。
- **前端列表页同构写法**：`query = reactive({page, pageSize, keyword, ...筛选})` → `load()` 填 `rows/total` → `el-table` + `el-pagination`；失败 Toast 由拦截器统一处理，页面只写成功/校验提示；危险操作用 `ElMessageBox.confirm`。
- **前端管理员须知**：后台 bundle 较大（>500kB）属已知现象；管理端**未注册图标库**，菜单只用文字，别写 `<el-icon>`。
- **计费/芹菜 / Excel**：导出只用 exceljs，`/orders/export` 路由必须注册在 `/orders/:id` **之前**。
- **multer 错误不走 Express 异常链**，必须就地包装成 JSON，否则被全局异常吞成 500。

## 6. 迭代完成清单（交给每一次任务）

1. 代码实现 + `node -e "require('./src/routes')"` 能加载（快速冒烟）。
2. 前端改动：至少 `cd admin-web && npm run build` 通过。
3. 更新 `docs/requirements.md`：顶部**版本号与日期** → 相关章节正文 → **Change Log 表格首行**（倒序）。
4. 涉 C 端接口：同步 `docs/api-for-miniprogram.md` 及其 Change Log。
5. 跑工具：`node scripts/sort_changelog.js`、`node scripts/gen_docs_toc.js check`。
6. 汇报时说明改动范围；**不 commit**，等用户指令。

## 7. 已知坑（动手前扫一眼）

| # | 坑 | 规避 |
|---|---|---|
| 1 | 订单号只到秒，无随机位，并发下单必冲突 | 改这块要带去重/重试 |
| 2 | `ensureAuth` 返回 -2（openid 已绑他人）时**未回滚**刚新建的用户 | 会产生无主账号 |
| 3 | `scripts/local-dev-init.sql` **缺 `pp_coupon` / `pp_user_coupon` 建表**（券表只在 `scripts/migrate_coupon.js`），用它重建本地库会直接缺券表 | 本地重建后补跑 `migrate_coupon.js` |
| 4 | 时区：凡未手工格式化的接口仍返回 ISO UTC 串（`admin.model.getOrderList` 原样返回 `o.*`） | 新增字段留意，前端统一 `formatDateTime` |
| 5 | `refundFee` 用真值判断，传 `0` 会静默变成**全额退** | 判空别用 `??`/`||` 混写 |
| 6 | 后台 `/orders/:id/refund` **完全不校验订单状态**（注释明示），可越过 C 端限制 | 改前先确认是否要收紧 |
| 7 | `/checkout` 与 `/createOrder` 各调两次 `calcOrderPrice`、一次下单查车 ≥3 次 | 优化时注意别改算价口径 |
| 8 | `getUserDriverInfo` 不存在时返回裸 `-1`（非标准响应体） | 前端要兼容 |
| 9 | `pp_` 是新前缀，`adp_` 仅残留在旧注释与旧表；`pp_car.clean_price` 历史回填为当时 1 元，老订单导出显示 1 | 勿被旧注释误导 |
| 10 | `app.js` 的 `/images` 用了 `fallthrough:false`，图片 404 时返回空 body 而非统一格式 | 排查图片 404 时注意 |
| 11 | GET 承载写操作（`/updateUserDriverInfo`、`/getWxPay` 用 query），无鉴权、uid 前端传 | 属历史设计，别顺手"修正"成 POST |
| 12 | 本地 `.env` **直连线上生产库**，本地调试的写操作会直接改生产数据 | 跑测试脚本前确认 |

## 8. 不同任务的检查清单

- **改 C 端接口** → 先看 `docs/api-for-miniprogram.md` 是否要同步；涉及金额必走 `pay_amount`；响应 `{code:200,...}` 勿改。
- **改后台** → 路由挂 `adminAuth` 之后；响应 `{code:0,data}`；列表分页用 `page/pageSize`；时间字段格式化。
- **改数据库** → 写 `scripts/migrate_*.js`（**幂等**）+ 更新 §3 表结构；必要时先离线导出备份 SQL（不放项目目录，避免入库）。
- **改前端** → 列表页沿用现有结构；金额列注意三口径；`npm run build` 验证。
- **不确定时** → 先读 `docs/requirements.md` 对应章节与 `docs/ai-context.md`，再动手；不要把猜测当既成事实写进文档。
