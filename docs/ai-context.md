# pangpai-car · AI 深度技术上下文

> 整理于 2026-10-31（版本 v1.7.4），基于静态代码阅读，供 AI 快速建立准确的项目理解。
> **行号会漂移，请以函数名 / SQL 为准。** 规则性约定见 [`AGENTS.md`](../AGENTS.md)，业务口径与 Change Log 见 [`requirements.md`](requirements.md)。

---

## 1. 入口与装配（`app.js`）

中间件顺序：`express.json()` → `/images` 静态 → `/admin` 静态 + SPA 兜底 → `routes` → 404 → 全局异常。无 cors、无 urlencoded、无日志中间件。

- `/images` 用 `express.static(config.upload.dir, { maxAge:'1h', fallthrough:false })`。**`fallthrough:false` 的后果**：图片 404 时不走后续路由、不打业务 404，直接返回空 body。
- `/admin` 只在 `admin-web/dist` 存在时托管，缺失时仅打印一行提示，**不阻断启动**。
- 全局异常返回 `{code:500,msg:'服务器内部错误'}`，会**吞掉 asyncHandler 抛出错误的业务语义**；multer 这类不走 Express 异常链的错误更要自己包装。
- `src/routes/index.js` 挂载：`user` → `/admin-api` → `car` / `coupon` / `checkout` / `order` / `payment` / `wechat` / `upload`，平级无重叠。

## 2. 认证与用户链路

`controllers/user.controller.js` + `models/user.model.js`

| 环节 | 实现 | 返回语义 |
|---|---|---|
| `tryLogin` | `loginByOpenid` 只查不注册 | 有 → 200 + 用户行；无 → **202** + `needRegister`/`registerBy:'phone'`（`needPhone` 是遗留兼容字段） |
| `loginByPhone` | `loginOrRegisterByPhone`，手机号=唯一账号 | 用户行 / `-2`（openid 已绑他人 → controller 转 400）/ `undefined`（失败 → 500） |
| `ensureAuth` | 授权行 `user_id` 不符时返回 `-2` 且绝不改写 | 防串号，但**未回滚刚 INSERT 的新用户** |
| 驾驶证 | `updateUserDriverInfo` select-then-insert/update | 非幂等竞态；`getUserDriverInfo` 缺失返回裸 `-1` |

- 唯一索引：`uk_phone(phone)`、`uk_biz_openid(biz_code, openid)`（见 `scripts/local-dev-init.sql`）。
- `loginByOpenid` 会先 DELETE 孤儿授权行，这是 openid 能被重新注册的前提。
- **C 端无鉴权，`uid` 由前端传参即信任**——这是历史设计，勿顺手改成必须登录。

## 3. 计价链路（`services/pricing.service.js` = 唯一真源）

- `calcRentDays`：`Math.max(1, Math.ceil((end-start)/DAY_MS))`，24h 向上取整、至少 1 天；时间不合法抛 `PriceError`。
- 租金单价取 `promotion_day_price || day_price`；保险 l1/l2 取 `pp_car.insurance_price_l1/l2`（**旧的 `insurancePrice` 数值不再采信**，仅按 ≥100 推断档位）；司机费走白名单 `[0, 400]`。
- 公式：`total = round2(租金) + round2(保险) + round2(司机) + clean_price`，**整备费不乘天数**。
- 抵扣：`discount = min(coupon.amount, total)`，`pay = total - discount`。`total_price` 恒为原价（GMV 口径）。
- 兜底常量：`LEGACY_CLEAN_PRICE = 1`（历史回填老订单为当时 1 元），与现行默认 50 不符，导出老订单会看到 1。
- **"唯一真源"的实际情况**：`/checkout` 与 `/createOrder` 确实都调 `calcOrderPrice`，但后台并**没有改价端点**；且两处各调用两次（算原价→校验券→带券重算），`/createOrder` 落库前 `order.model` 还会再查一次车，一次下单查车 ≥3 次。改这块务必保持口径不变。

## 4. 下单与支付

- `genOrderSn`（`models/order.model.js`）：`'PP' + moment('YYYYMMDDHHmmss')` —— **只到秒，并发必冲突，无去重重试**。v1.7.3 起因要先核销券，改为在 controller 生成后透传给 model。
- 手机号强校验在 `utils/validate.js` 的 `validateContactPhone`，**`/checkout` 只规范化不强拦**，最终由 `/createOrder` 拒绝。
- 券核销在**建单之前**，`affectedRows !== 1` 视为并发；建单失败的三条分支都会 `revertCoupon`。
- `pp_order` 落库 21 列，全部取服务端重算结果；`rent_day` 是 `varchar(5)`，`pickup_time/return_time` 是 **varchar(50) 存毫秒时间戳字符串**（导出时需双兼容 date 串与时间戳）。
- 回调 `payment.controller.js` 的 `handlePaymentNotify`：手动拼 XML → 验签 → 订单存在 → **金额核验（`pay_amount ?? total_price`）** → `markOrderPaid`（`WHERE pay_status=0` 天然幂等）→ 企微通知 → 应答。
- 路由 `/wxPayCallback` **未包 asyncHandler**，内部自行 try/catch；非 SUCCESS 的 `return_code`/`result_code` 一律 replySuccess 静默丢弃。

## 5. 退款（`services/refund.service.js`）

- 上限：`paidAmount = pay_amount ?? total_price`；`refundFee <= paidAmount*100`，否则抛错。
- **⚠️ `refundFee` 用真值判断**：`options.refundFee ? ... : totalFee`，传 `0` 会静默变成**全额退**。
- 退款单号 `'R' + orderSn`：固定映射天然幂等，但也意味同一订单**无法多次部分退款**。
- 必须先 `pay_status === 1`；**微信侧成功但 DB 失败会显式告警要求人工核对**。
- 退券 `returnCouponByOrder` 按 `order_sn` 找券，**已过期则不退回**（返回 `expired`）。
- 后台 `/admin-api/orders/:id/refund` **不做任何状态校验**（注释明示），可越过 C 端限制；C 端 `/cancelRefund` 才要求 `pay_status=1 && order_status=0`。
- 证书：PEM 优先（`apiclient_cert.pem` + key），回退 p12（passphrase = mchId）；Node 17+ OpenSSL3 会因 RC2 拒绝老式 p12，所以生产用 PEM。

## 6. 优惠券（`services/coupon.service.js` + `models/coupon.model.js`）

- **原子扣库存**：`UPDATE pp_coupon SET remain_stock=remain_stock-1 WHERE coupon_id=? AND status=1 AND remain_stock>0 AND NOW() BETWEEN receive_start_time AND receive_end_time`；`affectedRows===0` 时回查区分 -1/-2。
- 限领：先 COUNT 再 INSERT 带 `receive_seq = count+1`，靠唯一键 `uk_coupon_uid_seq(coupon_id, uid, receive_seq)` 硬兜底；超限时手动把库存加回。
- `validateCoupon` 顺序：**状态 → 使用时间窗 → 适用车辆（scope_type=2 时 split scope_car_ids）→ 金额门槛（订单金额 ≤ 面额则不可用）**。
- `useCoupon` / `revertCoupon` 均带 `status` 条件，`affectedRows===0` 即并发占用。
- 废弃批次会**连带作废**该批用户已领未用的券。
- `getUserCoupons` 的适用车辆筛选用 `FIND_IN_SET`，无法走索引（数据量小，暂可接受）。
- **易错**：批次有两个标识 —— `pp_coupon.id`（数字主键，后台 `:id` 用它）与 `coupon_id`（批次号字符串，存在用户券表）。领券记录必须先按主键查批次、再取其批次号去关联。

## 7. 后台层（`models/admin.model.js` + `controllers/admin/*.js`）

- `pageParams` 统一算 offset，`pageSize` 被 clamp 到 1..100。
- 列表一律"两遍查询"：分页 SELECT + `SELECT COUNT(*) AS total`。
- 用户列表关键词命中 openid 用 `EXISTS (子查询)`；领券记录用 `LEFT JOIN pp_user`，并把四个 summary 指标写进同一个 COUNT 查询的 `SUM(CASE WHEN ...)`。
- 订单列表/详情/导出都 `LEFT JOIN pp_user_coupon uc ON uc.coupon_sn = o.coupon_sn AND o.coupon_sn <> ''`——**空串必须排除**，否则 LEFT JOIN 会匹配脏行。
- `buildOrderWhere` 被列表与导出共用，保证口径一致；导出不分页、`LIMIT 20000`。
- 导出只在这里用 exceljs：建 workbook → 冻结表头 → `wb.xlsx.write(res)`；文件名走 `filename*=UTF-8''<encodeURIComponent>`。
- **路由顺序**：`/orders/export` 必须注册在 `/orders/:id` 之前。
- 校验风格：控制器内手写 validate 函数返回中文错误串，失败 `{code:400,msg}`；成功 **`{code:0,data}`**（与 C 端 `{code:200}` 不同）。`admin/coupon.controller.js` 的 `validateCouponInput(payload,{partial})` 是唯一被两侧复用的校验。

## 8. 基础设施

- `utils/mysql.js`：**每次 `new MySQL()` 都 `createConnection` 再 `close()`，不是连接池**，同一请求常开多个独立连接；`connection.on('error')` 只 log 不重连。
- `middlewares/adminAuth.js`：无 token → 401 `{code:401,msg:'未登录'}`；verify 失败 → 401 `{code:401,msg:'登录已过期，请重新登录'}`；payload 挂 `req.admin`。JWT 对称密钥，有效期默认 12h。
- `tasks/refreshAccessToken.js`：启动即刷一次 + 每小时；**兜底在消费端** `getAccessTokenCached()`（读文件 + `mtime` 判 90 分钟陈旧 → 自动重取落盘），所以 token 任务挂掉也能自愈。
- **时区**：mysql2 未配 `timezone`，`DATETIME` 会被按本地时区构造成 Date、序列化成 **ISO UTC 串**。项目靠手工格式化补救（`getOrderDetail` 用 date-fns、导出用 dayjs、前端用 `formatDateTime`）。`admin.model.getOrderList` 原样返回 `o.*`，因此后台订单列表的时间仍是 UTC ISO 串。

## 9. 管理前端（`admin-web/`）

- `main.js`：Pinia + router + ElementPlus(zh-cn)；**未注册图标库**，所以菜单项只用文字，不要写 `<el-icon>`。
- `router`：`createWebHistory('/admin/')`；`/login` 是 `meta.public` 独立页，其余挂 `AdminLayout`；守卫**只判断 localStorage 有无 token**，不校验有效期，过期由 api 拦截器 401 兜底。
- `api/index.js`：`baseURL:'/admin-api'`、`timeout:15000`；拦截器三层 —— blob 直接返回原始响应、`code===0` 返回 `data.data`（页面拿到裸数据）、`code===401` 清 token 跳登录；其余 `ElMessage.error(msg)` 后 reject。超时要在调用点覆盖（图片上传用了 30s）。
- `utils/format.js` 只导出 `formatDateTime`（本地时区 `YYYY-MM-DD HH:mm:ss`，空值返回 `-`）。新页面的时间列一律用它。
- `constants.js`：`PAY_STATUS`（0待支付/1已支付/2已退款/3支付失败）、`ORDER_STATUS`（0待取车/1已取车/2已还车/3已完成/4已取消），各带 tag 文案与配色。
- 列表页四页同构：`query = reactive({page:1, pageSize:10, keyword:'', ...筛选})` → `load()` → `rows/total/loading` → `el-table` + `el-pagination`。写操作后必 `load()`；危险操作 `ElMessageBox.confirm`；失败 Toast 不写在页面。
- `Cars.vue` 编辑/排序用的是**整行 PUT**——必须带上 `clean_price`/`insurance_price_l1`/`insurance_price_l2`，否则后端会回退成默认值。
- 图片上传（v1.7.4）：`el-upload` + 自定义 `:http-request`（为复用带 JWT 的 api 实例），`before-upload` 校验 jpg/png/webp 与 5MB，成功回填 `form.image_url`，同时保留手填 URL 输入框。后端常量与其保持一致。

## 10. 脚本、部署、配置

| 文件 | 用途 | 幂等 |
|---|---|---|
| `scripts/migrate_user_to_pp.js` | v1.6.15 用户表 `adp_*` → `pp_*`，保留原 id | 幂等，只 SELECT+INSERT |
| `scripts/migrate_car_fee_fields.js` | v1.6.18 车辆整备费/保险费字段 + 订单快照列 | 幂等（存在则跳过） |
| `scripts/migrate_order_clean_price_position.js` | v1.6.19 调整 `clean_price` 列位置 | 幂等，会重建注释防乱码 |
| `scripts/migrate_user_phone_unique.js` | v1.7.0 手机号唯一索引 + 清孤儿授权 | 幂等；遇重复手机号中止 |
| `scripts/migrate_coupon.js` | v1.7.3 券两表 + 订单 4 列 + 回填 `pay_amount` | 幂等 |
| `scripts/local-dev-init.sql` | 本地一键建表 + 种子（**生产勿用**） | 非幂等（DROP + CREATE）；**缺 pp_coupon / pp_user_coupon 建表** |
| `scripts/gen_docs_toc.js` | 文档目录生成/校验（check / update / print） | 幂等 |
| `scripts/sort_changelog.js` | Change Log 降序重排 | 幂等 |

- **PM2**（`ecosystem.config.cjs`）：`pangpaicar`（`./app.js`，500M 重启）与 `pangpai-token`（`refreshAccessToken.js`，200M）；日志在 `logs/`（不入库）。
- `pangpaicar_start.sh`：把宝塔 Node `v24.11.1` 的 PATH 前置 export 后用绝对路径拉 PM2。
- `src/config/index.js`：`dotenv` 读根目录 `.env`；`resolveDir` 把相对路径拼到 `ROOT` 下；证书用 getter 惰性读取，未配置不阻断启动，`hasCert()` 做 PEM 优先判定。
- `uploads/`：根=通用上传（公开 `POST /upload`），`car_img/`=后台车辆图。均由 `require` 侧 `mkdirSync(recursive:true)` 自动创建。

## 11. 已知缺陷与易错点（明细）

1. 订单号秒级无随机位，并发冲突。
2. `ensureAuth` 返回 -2 时不回滚新建用户，产生无主账号。
3. `local-dev-init.sql` 缺券表，用它重建本地库会直接不可用。
4. 未格式化的接口仍返回 ISO UTC 时间串。
5. `refundFee` 真值判断，传 `0` 变全额退。
6. 后台退款不校验订单状态。
7. `/checkout`、`/createOrder` 重复调用算价与查车（口径一致的前提下仅是浪费）。
8. `getUserDriverInfo` 返回裸 `-1`。
9. `adp_` 残留于旧注释与历史表；老订单 `clean_price` 快照为 1 元。
10. `/images` 的 `fallthrough:false` 使图片 404 脱离统一响应格式。
11. GET 承载写操作、C 端无鉴权、uid 信任前端——历史设计，改动需谨慎评估。
12. 本地 `.env` 直连生产库，本地写操作会改生产数据。
13. `npm install` 的 `@vueuse/core@15` EBADENGINE 警告来自 element-plus 的传递依赖（本机 Node 18 该包要求 ≥22），实测构建运行正常，不必处理。
