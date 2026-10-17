# 庞派租车 · 小程序端（C 端）接口文档

> 面向**小程序前端**的接口清单。后端由 `pp_service`（Express）提供，前端只需按本文档约定调用。
>
> - 基础地址：`https://pangpai-car.com`
> - 均支持 GET query / POST JSON（除文件上传为 multipart）
> - 文档维护约定：**任何涉及小程序端接口的改动，都必须同步更新本文件后再交付前端**（版本记录见文末 Change Log）
>
> 适用版本：后端 **v1.6.8** ｜ 更新日期：2026-10-17

---

## 0. 通用约定与注意事项

1. **响应格式不统一（历史遗留）**：不同接口的成功响应结构不同，主要有以下几种，请按接口逐一判断：
   - `{code:200, result:{...}}`（登录、车辆列表等）
   - `{message:'数据接收成功', result:{...}}`（创建订单）
   - `{success:true, data:{...}}`（支付类）
   - 裸对象 / 裸数字（结算、驾驶证信息）
2. **时间字段**：`create_time`/`update_time`/`pay_time` 为 MySQL datetime（后端返回 `2026-10-11 13:13:59` 格式或原始值）；`pickup_time`/`return_time` 为**毫秒时间戳字符串**，前端需自行格式化。
3. **金额**：单位均为**元**（后端内部再转分传给微信支付）。
4. 支付相关接口为微信支付 V2，`totalFee` 传**元**（后端换算成分）。

---

## 1. 登录与用户

### 1.1 换取 openid

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getOpenid` |
| 参数 | `code`（必填，`wx.login()` 获取的临时登录凭证） |
| 成功 | `{code:200, result:{openid, session_key, unionid?, ...}}`（result 为微信 `jscode2session` 原始返回） |
| 失败 | `{code:201, msg:'缺少code参数'}`；code 失效时 result 中返回微信错误码（如 `40029 invalid code`） |
| 示例 | `https://pangpai-car.com/getOpenid?code=xxx` |

> 前端调用 `wx.login()` 拿 code → 调本接口 → 拿 openid 再调 `tryLogin`。

### 1.2 openid 登录（自动注册）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /tryLogin` |
| 参数 | `openid`（必填）、`unionid`（可选，建议传，用于跨小程序识别同一用户） |
| 成功 | `{code:200, msg:'自动登陆成功', result:{id, phone, nickname, username, ...}}` ← **result.id 即 uid，后续接口都用它** |
| 失败 | `{code:201, msg:'登陆失败'}` |

### 1.3 查询驾驶证信息

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getUserDriverInfo` |
| 参数 | `uid`（必填） |
| 成功（有记录） | 驾驶证对象 `{id, user_id, driver_idcard_name, driver_idcard_number, driver_idcard_url, driver_idcard_birth, ...}` |
| 成功（无记录） | `-1`（**裸数字**，不是 code 结构） |
| 备注 | 判断是否已认证：`typeof res === 'object' && res.id` |

### 1.4 提交 / 更新驾驶证信息

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /updateUserDriverInfo` |
| 参数 | `uid`、`driver_idcard_name`、`driver_idcard_number`、`driver_idcard_url`、`driver_idcard_birth` |
| 返回 | `0` = 成功；`-1` = 失败（**裸数字**） |
| 备注 | 建议先走「上传图片 → OCR 识别 → 回填本接口」流程，见第 5 节 |

---

## 2. 车辆

### 2.1 车辆列表（分页）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getCarList` |
| 参数 | `pageNum`（必填，页码，**从 1 开始**；传 0 或空返回 `400 参数错误`） |
| 成功 | `{code:0, list:[ {...车辆对象}, ... ]}`，每页 10 条 |
| 车辆对象字段 | `id`、`car_name`、`image_url`、`des`、`day_price`、`promotion_day_price`（**结算用此价**）、`create_time`、`update_time`、`status`（1 上架 / 0 下架，v1.6.7 新增）、`sort`（1~10000，越小越靠前，v1.6.7 新增） |
| 备注 | **v1.6.7 起：① 只返回上架车辆；② 后端已按 `sort` 升序排好序，前端不要二次排序** |

### 2.2 车辆详情

> 目前**没有独立的车辆详情接口**，结算接口 `/checkout` 的返回里包含完整车辆对象（`result.data`），详情页可复用该字段，或用列表数据本地缓存。

---

## 3. 结算计价

### 3.1 结算计价（提交订单前调用）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /checkout` |
| 参数 | `uid`（必填）、`carId`（必填）、`pickUpTime`（毫秒时间戳）、`returnTime`（毫秒时间戳）、`pickUpAddress`、`returnAddress`、`contact_phone`、`insurancePrice`（保险单价/天）、`driver_price`（司机单价/天） |
| 成功 | 裸对象（无 code 包裹）：`{uid, contact_phone, data:{车辆对象}, rent_day_price, rentDay, rent_total_price, clean_price(整备费=1), server_day_price, server_total_price, door_pickup_price, door_return_price, driver_price, driver_total_price, total_price, pickUpAddress, returnAddress, pickUpTime, returnTime}` |
| 失败 | `{code:-1, msg:'参数缺失'}` |
| 备注 | **本接口的返回对象可直接作为 `/createOrder` 的 `checkOutArray` 传入**（字段名已对齐） |

### 3.2 保险价格档位

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getInsurancePrice` |
| 参数 | 无 |
| 返回 | `{code:200, insurancePrice_l1:1, insurancePrice_l2:120}`（单位：元/天） |

### 3.3 司机服务价格

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getDriverPrice` |
| 参数 | 无 |
| 返回 | `{code:200, driver_price:400}`（单位：元/天） |

---

## 4. 订单与支付

### 4.1 创建订单

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `POST /createOrder` |
| Content-Type | `application/json` |
| 请求体 | `{ "checkOutArray": { ...`/checkout` 返回的整个对象... } }`，其中必含 `uid`、`data.id`（车辆 id） |
| 成功 | `{message:'数据接收成功', result:{id, order_sn, uid, car_id, total_price, pay_status:0, order_status:0, ...}}` ← **成功响应不带 `code`** |
| 失败（v1.6.8 新增） | `400 {"code":400,"msg":"该车辆已下架，暂不可预订"}` / `400 {"code":400,"msg":"车辆不存在，无法下单"}` / `500 {"code":500,"msg":"订单创建失败"}` |
| 参数缺失 | `400 {"code":400,"msg":"参数缺失：缺少 checkOutArray 或 uid"}` |
| 前端判断 | **先判断 `res.code === 400` → 提示 `res.msg` 并返回列表刷新；否则取 `res.result.order_sn` 继续支付** |

### 4.2 订单列表

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getOrderList` |
| 参数 | `uid`（必填）、`pageNumber`（页码，从 1 开始，不能为 0） |
| 成功 | `{code:200, result:[ {订单对象}, ... ]}` |
| 空数据 | `{code:201, msg:'无订单数据'}` |

### 4.3 订单详情

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getOrderDetail` |
| 参数 | `orderSn`（订单号，必填）、`uid`（必填） |
| 成功 | `{code:200, result:{...订单字段, carInfo:{车辆对象}}}`；`create_time`/`update_time`/`pickup_time`/`return_time` **后端已格式化为 `yyyy-MM-dd HH:mm:ss`，前端直接展示即可** |
| 空数据 | `{code:201, msg:'无订单数据'}` |

**订单状态枚举：**

| 字段 | 值 |
|---|---|
| `pay_status` | 0 待支付 / 1 已支付 / 2 已退款 / 3 支付失败 |
| `order_status` | 0 待取车 / 1 已取车 / 2 已还车 / 3 已完成 / 4 已取消 |

### 4.4 发起支付（JSAPI 下单）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getWxPay` |
| 参数 | `outTradeNo`（订单号 order_sn）、`totalFee`（金额，**元**）、`openid`、`body`（商品描述）、`attach`（附加数据，可选） |
| 成功 | `{success:true, data:{prepayId, paymentParams:{timeStamp, nonceStr, package, signType, paySign}}}` |
| 失败 | `{success:false, message:'错误信息'}` |
| 备注 | `paymentParams` 直接传给 `wx.requestPayment(...)` 即可 |

### 4.5 查询支付结果

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /queryWxPayOrder` |
| 参数 | `outTradeNo`（订单号）、`transactionId`（微信支付单号，可选） |
| 成功 | `{success:true, data:{...微信订单查询结果}}` |
| 失败 | `{success:false, message:'错误信息'}` |

### 4.6 申请退款

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `POST /applyRefund` |
| 请求体 | `{outTradeNo, outRefundNo, totalFee, refundFee, refundDesc}`（金额单位：元） |
| 成功 | `{success:true, data:{...微信退款结果}}` |
| 失败 | `{success:false, message:'错误信息'}` |

> 以下两个为**服务端回调**，前端不调用：`POST /wxPayCallback`（微信支付通知）、`GET /workWeixinCallback`（企业微信回调验证）。

---

## 5. 文件上传与 OCR 识别

### 5.1 上传图片

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `POST /upload` |
| 类型 | `multipart/form-data`，字段名 **`file`**（单文件，上限 10MB） |
| 成功 | `{code:200, path:'https://pangpai-car.com/images/xxx.jpg'}` |
| 失败 | `400 {"code":400,"msg":"缺少file字段或文件为空"}` |

### 5.2 身份证 OCR 识别

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getIdCardInfo` |
| 参数 | `img_url`（**必填，公网可下载的图片 URL**，建议先 urlEncode） |
| 成功 | 微信 OCR 返回：`{type, name, id, ...}`（正面 type=0，反面 type=1） |
| 常见错误 | `errcode:101000 invalid image url` —— 图片地址微信下载不到（本地地址或文件不存在） |
| 备注 | `/upload` **不会**自动识别，必须上传后再单独调本接口 |

**完整认证流程：**

```
① POST /upload（file）                      → path（公网图片URL）
② GET  /getIdCardInfo?img_url=①的path      → 识别结果（姓名/身份证号/出生日期）
③ GET  /updateUserDriverInfo?uid=&driver_idcard_xxx=②结果  → 返回 0 即成功
```

### 5.3 生成小程序码

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getQrCode` |
| 参数 | `scene`（场景值）、`page`（小程序页面路径，如 `pages/index/index`，不带前导 `/`） |
| 返回 | `image/png` **二进制图片流**（不是 JSON） |

---

## 6. Change Log（接口变更记录）

| 版本 | 日期 | 涉及接口 | 变更内容 | 前端是否需改 |
|---|---|---|---|---|
| v1.6.8 | 2026-10-17 | `POST /createOrder` | 下单前校验车辆上架状态：已下架 → `400 该车辆已下架，暂不可预订`；车辆不存在 → `400 车辆不存在，无法下单`；写入失败 → `500` | **需要**：下单失败判断改为先看 `res.code === 400` 并提示 `res.msg` |
| v1.6.7 | 2026-10-17 | `GET /getCarList` | ① 仅返回上架车辆（`status=1`）；② 排序改为后端按 `sort` 升序；③ 车辆对象新增 `status`、`sort` 字段 | **需要**：移除前端本地排序逻辑，按返回顺序渲染 |
| v1.6.2 | 2026-10-11 | `GET /getIdCardInfo`、`GET /getQrCode` | 服务端 token 缓存缺失不再 500，自动获取后继续处理（参数与响应不变） | 否 |
| v1.5.0 | — | `GET /getOrderList`、`GET /getOrderDetail` | 订单新增 `pay_status`（支付状态）、`order_status`（履约状态）、`transaction_id`、`pay_time` | 需要（按新状态枚举展示） |

---

## 7. 联调自测清单

1. 登录：`wx.login()` → `/getOpenid` → `/tryLogin`，确认拿到 `uid`
2. 车辆列表：`/getCarList?pageNum=1`，确认顺序与后台 sort 一致、下架车不出现
3. 结算：`/checkout` 传入取还车时间（毫秒时间戳）→ 确认 `total_price` 正确
4. 下单：`/checkout` 结果整包作为 `checkOutArray` → `/createOrder` → 拿到 `order_sn`
5. 支付：`/getWxPay` → `wx.requestPayment` → `/queryWxPayOrder` 确认 `trade_state=SUCCESS`
6. 订单：`/getOrderList`、`/getOrderDetail` 确认状态展示正确
7. 认证：`/upload` → `/getIdCardInfo` → `/updateUserDriverInfo`（返回 `0` 即成功）
8. 异常：下架某车后从历史入口下单，应收到 `400 该车辆已下架，暂不可预订`
