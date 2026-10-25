# 庞派租车 · 小程序端（C 端）接口文档

> 面向**小程序前端**的接口清单。后端由 `pp_service`（Express）提供，前端只需按本文档约定调用。
>
> - 基础地址：`https://pangpai-car.com`
> - 均支持 GET query / POST JSON（除文件上传为 multipart）
> - 文档维护约定：**任何涉及小程序端接口的改动，都必须同步更新本文件后再交付前端**（版本记录见文末 Change Log）
> - **交付约定：改动涉及本文件所列接口时，必须向项目负责人明确报告「入参/出参是否有变动」，若前端需因此改代码（新增返回字段、新增错误码、字段类型/单位变化等）必须单独提醒其更新小程序**
>
> 适用版本：后端 **v1.7.0** ｜ 更新日期：2026-10-25

---

## 0. 通用约定与注意事项

1. **响应格式不统一（历史遗留）**：不同接口的成功响应结构不同，主要有以下几种，请按接口逐一判断：
   - `{code:200, result:{...}}`（登录、车辆列表等）
   - `{message:'数据接收成功', result:{...}}`（创建订单）
   - `{success:true, data:{...}}`（支付类）
   - 裸对象 / 裸数字（结算、驾驶证信息）
2. **时间字段**：`create_time`/`update_time`/`pay_time` 为 MySQL datetime（后端返回 `2026-10-11 13:13:59` 格式或原始值）；`pickup_time`/`return_time` 为**毫秒时间戳字符串**，前端需自行格式化。
3. **金额**：单位均为**元**（后端内部再转分传给微信支付）。
4. 支付相关接口为微信支付 V2，`totalFee` 传**分**（与支付回调核验口径一致：回调 `total_fee` 必须等于订单 `total_price×100`，否则支付不会被落库）。

---

## 1. 登录与用户

### 1.0 登录流程总览（v1.7.0 起：手机号为准）

```
        wx.login()  →  GET /getOpenid?code=        ← 拿到 openid(+unionid)，不注册
                              ↓
                    GET /tryLogin?openid=&unionid=  ← 只查不注册
                              ↓
              ┌───────────────┴───────────────┐
     code=200（已绑定）                 code=202 needPhone:true（未绑定）
              ↓                                 ↓
   【老用户】直接用 result.id=uid      【新用户】前端弹手机号授权按钮
     进首页（无需任何改动）            <button open-type="getPhoneNumber">
                                                ↓ e.detail.code
                                      GET /loginByPhone?code=&openid=&unionid=
                                                ↓
                                      手机号换号 → 注册 → 绑定 openid
                                                ↓
                                      code=200，result.id=uid → 存 uid 进首页
```

**A. 新用户（首次登录 / openid 未绑定）接口顺序**

| 步骤 | 接口 | 关键返回 |
|---|---|---|
| 1 | `wx.login()`（前端 API） | `code` |
| 2 | `GET /getOpenid?code=` | `result.openid`（建议一并把 `unionid` 留着） |
| 3 | `GET /tryLogin?openid=&unionid=` | `202 {"needPhone":true}` → 转第 4 步 |
| 4 | 前端 `<button open-type="getPhoneNumber">` | `e.detail.code`（一次性，勿缓存） |
| 5 | `GET /loginByPhone?code=&openid=&unionid=` | `200`，`result.id` = uid |
| 6 | 存 uid → 首页 | — |
| 7 | 需要租车时：`/upload` → `/getIdCardInfo` → `/updateUserDriverInfo?uid=` | 驾驶证登记 |

**B. 老用户（v1.7.0 前已 openid 绑定）接口顺序**

| 步骤 | 接口 | 关键返回 |
|---|---|---|
| 1 | `wx.login()` → `GET /getOpenid?code=` | `result.openid` |
| 2 | `GET /tryLogin?openid=&unionid=` | `200`，`result.id` = uid → 直接进首页（**行为同 v1.6.x，前端无需改动**） |
| 3 | 可选：若 `result.phone` 为空，提示补手机号 → `GET /bindPhone?uid=&code=` | `200`，补齐后换设备也能靠手机号找回账号 |

**C. 换设备 / 换微信号**：仍走 A 的 4~5 步，同一手机号会**登录回原 uid**（订单、驾驶证都在），并自动补绑新的 openid。

**D. 登录后的业务调用顺序**

```
/getCarList → /getCarFee?carId= → /checkout → /createOrder(checkOutArray 整包)
     → /getWxPay → wx.requestPayment → /getOrderList、/getOrderDetail
     → 需要取消时：未支付 /cancelOrder，已支付未取车 /cancelRefund
```

> ⚠️ 判断新老用户**只看 `/tryLogin` 的 code**：`200` = 已注册直接进；`202` = 未注册走手机号授权。不要再用"是否返回 uid"以外的方式判断，也不要自己调接口创建用户。

### 1.1 换取 openid

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getOpenid` |
| 参数 | `code`（必填，`wx.login()` 获取的临时登录凭证） |
| 成功 | `{code:200, result:{openid, session_key, unionid?, ...}}`（result 为微信 `jscode2session` 原始返回） |
| 失败 | `{code:201, msg:'缺少code参数'}`；code 失效时 result 中返回微信错误码（如 `40029 invalid code`） |
| 示例 | `https://pangpai-car.com/getOpenid?code=xxx` |

> 前端调用 `wx.login()` 拿 code → 调本接口 → 拿 openid 再调 `tryLogin`。

### 1.2 openid 登录（**v1.7.0 起只查不注册**）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /tryLogin` |
| 参数 | `openid`（必填）、`unionid`（可选，建议传，用于跨小程序识别同一用户） |
| 成功 | `{code:200, msg:'自动登陆成功', result:{id, phone, nickname, username, ...}}` ← **result.id 即 uid，后续接口都用它** |
| **未注册** | **`{code:202, msg:'未注册，请先授权手机号', needPhone:true}`** ← **v1.7.0 新增，前端必须处理：引导用户走手机号授权（1.3）** |
| 失败 | `{code:201, msg:'登陆失败'}`（缺 openid 参数） |

> ⚠️ **变更**：v1.7.0 起未绑定的 openid **不再自动创建账号**，返回 `202` 而不是直接给 uid。老用户（此前已 openid 绑定过）不受影响，仍返回 `200`。

### 1.3 手机号注册 / 登录（**v1.7.0 新接口，注册主入口**）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /loginByPhone` |
| 参数 | `code`（**必填**，`<button open-type="getPhoneNumber">` 事件里的 `e.detail.code`，**不是 `wx.login()` 的 code**）、`openid`（建议传，来自 `/getOpenid`）、`unionid`（可选） |
| 成功 | `{code:200, msg:'登陆成功', result:{id, phone, nickname, ...}}` ← **result.id 即 uid** |
| 失败 | `{code:201, msg:'缺少code参数'}`；`{code:400, msg:'手机号获取失败：'+微信错误, wxErrcode:...}`（常见 `40029 invalid code`——code 已被使用过或无效，需重新拉起授权）；`{code:400, msg:'该微信已绑定其他账号，请联系客服'}`；`{code:500, msg:'注册失败，请重试'}` |
| 说明 | 服务端拿 code 向微信换真实手机号：**该手机号已注册则直接登录该账号**，未注册则新建账号；随后把 `openid`/`unionid` 绑定到该 uid |

**前端接入要点**：

```js
// wxml
<button open-type="getPhoneNumber" bindgetphonenumber="onGetPhone">授权手机号登录</button>
// js
async onGetPhone(e) {
  if (e.detail.code) {
    const r = await request('/loginByPhone', { code: e.detail.code, openid: this.openid });
    // r.code === 200 → r.result.id 即 uid，存起来进首页
  }
}
```

- `e.detail.code` **一次性**，用完即失效，不要缓存；失败时重新拉起授权拿新 code。
- 手机号能力由微信按次计费（约 0.03 元/次），且要求小程序为非个人主体。

### 1.4 补填手机号（老用户可选）

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /bindPhone` |
| 参数 | `uid`（必填）、`code`（必填，同 1.3 的手机号 code） |
| 成功 | `{code:200, msg:'手机号绑定成功', phone}` |
| 失败 | `{code:201, msg:'缺少uid或code参数'}`；`{code:400, msg:'手机号获取失败：...'}`；`{code:404, msg:'用户不存在'}`；`{code:400, msg:'该手机号已被其他账号使用'}` |

### 1.5 查询驾驶证信息

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getUserDriverInfo` |
| 参数 | `uid`（必填） |
| 成功（有记录） | 驾驶证对象 `{id, user_id, driver_idcard_name, driver_idcard_number, driver_idcard_url, driver_idcard_birth, ...}` |
| 成功（无记录） | `-1`（**裸数字**，不是 code 结构） |
| 备注 | 判断是否已认证：`typeof res === 'object' && res.id` |

### 1.6 提交 / 更新驾驶证信息

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
| 参数 | `uid`（必填）、`carId`（必填）、`pickUpTime`（毫秒时间戳）、`returnTime`（毫秒时间戳）、`pickUpAddress`、`returnAddress`、`contact_phone`、`driver_price`（司机单价/天）、**`insuranceLevel`（v1.6.18 新增）** |
| 成功 | 裸对象（无 code 包裹）：`{uid, contact_phone, data:{车辆对象}, rent_day_price, rentDay, rent_total_price, clean_price, server_day_price, server_total_price, door_pickup_price, door_return_price, driver_price, driver_total_price, total_price, insurance_level, pickUpAddress, returnAddress, pickUpTime, returnTime}` |
| 失败 | `{code:-1, msg:'参数缺失'}` / `400 {"code":400,"msg":"还车时间必须晚于取车时间"}` / `400 {"code":400,"msg":"取车/还车时间不合法"}` / `400 {"code":400,"msg":"司机费用不合法，可选值：0 / 400"}` / `400 {"code":400,"msg":"车辆不存在，无法结算"}` / `400 {"code":400,"msg":"车辆整备费配置异常，请联系客服"}` |
| 备注 | **本接口的返回对象可直接作为 `/createOrder` 的 `checkOutArray` 传入**（字段名已对齐） |
| **v1.6.18 计价公式** | **总费用 = 车辆日租金 × 天数 + 保险日单价 × 天数 + 司机日单价 × 天数 + 整备费**。ⓘ **整备费是「按订单一次性」收取，不乘天数**；其余三项都乘天数 |
| **v1.6.18 保险费来源** | 保险金额改为**按车辆配置**（后台车辆管理里配），`insuranceLevel` 传 `l1`（低档）/ `l2`（高档），**缺省或不传 = 低档 l1**。已**取消“不买保险”**，用户必须二选一 |
| **v1.6.18 保险费兼容说明** | 旧参数 `insurancePrice`（传金额）不再作为金额使用：为兼容老版本，**金额 ≥100 视为 `l2`，否则视为 `l1`**，实际计费仍按车辆配置。**建议前端尽快改为传 `insuranceLevel`** |
| **v1.6.12 计算口径** | **租用天数 = 时长 ÷ 24 小时向上取整，且至少 1 天**（例：相差 25 小时算 **2 天**，相差 23 小时算 **1 天**，`rentDay` 现为整数） |
| **金额来源** | 金额由服务端按车辆实时价重算，与前端传参无关；`driver_price` 仅作为选项输入并校验白名单（`0/400`，与 `/getDriverPrice` 输出一致）；保险金额不再由前端决定 |

### 3.2 保险价格档位

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getInsurancePrice` |
| 参数 | **`carId`（v1.6.18 起强烈建议传）**；不传返回系统默认档位金额 |
| 返回 | `{code:200, insurancePrice_l1:100, insurancePrice_l2:200}`（单位：元/天，**实际值取该车的配置**） |
| **v1.6.18 变更** | 金额不再是全局固定的 1 / 120，**改为每辆车单独配置**（后台「车辆管理」里改）。**保险必买**，前端不应再提供「不买保险」选项 |
| 失败 | `400 {"code":400,"msg":"车辆不存在"}`（传了 carId 但车辆不存在时） |

### 3.2.1 车辆费用配置 ⭐ v1.6.18 新增

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getCarFee` |
| 参数 | `carId`（必填） |
| 返回 | `{code:200, clean_price, insurancePrice_l1, insurancePrice_l2}` |
| 说明 | 一次取到该车的**整备费**（一次性、不乘天数）与**两档保险日单价**，结算页可直接展示，无需分别调两个接口 |
| 失败 | `400 {"code":400,"msg":"车辆不存在"}` |

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
| 失败（**v1.6.12 新增**） | `400 {"code":400,"msg":"还车时间必须晚于取车时间"}` / `400 {"code":400,"msg":"取车/还车时间不合法"}` / `400 {"code":400,"msg":"司机费用不合法，可选值：0 / 400"}` |
| 参数缺失 | `400 {"code":400,"msg":"参数缺失：缺少 checkOutArray 或 uid"}` |
| 前端判断 | **先判断 `res.code === 400` → 提示 `res.msg` 并返回列表刷新；否则取 `res.result.order_sn` 继续支付** |
| **v1.6.12 金额以服务端为准** | 天数、日租金、各项金额、总价**全部由服务端重算**，忽略 `checkOutArray` 里传来的 `rentDay` / `rent_total_price` / `total_price` 等。以订单详情 `/getOrderDetail` 或 `result` 返回的实际金额为准进行支付，**勿用本地计算值**（两者不一致时会支付失败） |
| **v1.6.18 保险档位以服务端为准** | 服务端按 checkOutArray 里的 `insurance_level`（`l1`/`l2`，缺省 l1）+ **该车的保险配置**重算保险费；前端传的 `server_day_price` / `server_total_price` 一律忽略。**请把 `/checkout` 返回的 `insurance_level` 原样带回**（即整包传 checkOutArray 即可，不要自行构造） |

### 4.2 订单列表

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `GET /getOrderList` |
| 参数 | `uid`（必填）、`pageNumber`（页码，从 1 开始，不能为 0）；**v1.6.17 新增可选**：`pay_status`、`order_status` |
| **v1.6.17 筛选说明** | `pay_status`：`0`未支付 / `1`已支付 / `2`已退款；`order_status`：`0`待取车 / `1`已取车 / `2`已还车 / `3`已完成 / `4`已取消。**支持逗号分隔多值**（如 `order_status=0,1`），在 **SQL 层全局筛选**（不是当前页过滤）。**不传 = 返回全部，与旧版行为完全一致**；传非法值（如 `99`）会被忽略，等同于不传 |
| 成功 | `{code:200, result:[ {订单对象}, ... ], total: 总数, page: 当前页, pageSize: 10}`（`total`/`page`/`pageSize` 为 **v1.6.17 新增的可选字段**，`result` 仍是订单数组，老版本只取 `result` 不受影响） |
| 空数据 | `{code:201, msg:'无订单数据'}`（筛选无命中、页码为 0 时同样返回此值） |
| Tab 传参建议 | 待支付 `pay_status=0`；进行中 `pay_status=1&order_status=0,1`；已完成 `order_status=2,3`；已取消/退款 `order_status=4` |

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
| 参数 | `outTradeNo`（订单号 order_sn）、`totalFee`（金额，**分**，如 ￥7.00 传 700）、`openid`、`body`（商品描述）、`attach`（附加数据，可选） |
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

### 4.6 小程序端取消订单并退款 ⭐ v1.6.11 新增

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `POST /cancelRefund` |
| 请求体 | `{orderSn, uid}`（也支持 query 传参） |
| 成功 | `{code:200, msg:'退款成功，已退 ￥xx', result:{refund_fee}}` |
| 失败（校验） | `400 缺少参数：orderSn 或 uid` / `403 无权操作该订单` / `404 订单不存在` / `400 订单未支付，无需退款` / `400 订单已退款` / **`400 订单已取车，无法取消退款，请联系客服`** |
| 失败（微信） | `500 {code:500, msg:'退款失败：xxx'}` |
| 前端判断 | 用 **`res.code === 200`** 判断成功；其余按 `res.msg` 提示用户 |

**退款条件（后端强校验）**：订单归属该 `uid` **且** `pay_status=1`（已支付）**且** `order_status=0`（待取车）。**已取车后不能自助退款**，需引导联系客服（后台可强制退款）。
退款成功后订单自动变为 **已退款（pay_status=2）+ 已取消（order_status=4）**，退款金额默认全额。

### 4.7 取消订单（仅未支付） ⭐ v1.6.16 新增

| 项 | 内容 |
|---|---|
| 方法 / 路径 | `POST /cancelOrder` |
| 请求体 | `{orderSn, uid}`（也支持 query 传参） |
| 成功 | `{code:200, msg:'订单已取消', result:{order_sn, order_status:4}}` |
| 失败 | `400 缺少参数：orderSn 或 uid` / `403 无权操作该订单` / `404 订单不存在` / `400 订单已支付，请走退款流程 /cancelRefund` / `400 订单已退款，无需取消` / `400 订单已取消` / `400 订单已取车，无法取消，请联系客服` / `500 取消订单失败，请稍后重试` |
| 前端判断 | 用 **`res.code === 200`** 判断成功；其余按 `res.msg` 提示用户。**`msg` 里出现 `/cancelRefund` 时，可引导用户改走退款流程** |

**取消条件（后端强校验）**：订单归属该 `uid` **且** `pay_status=0`（未支付）**且** `order_status=0`（待取车）。
**本接口不涉及任何资金操作**，仅把订单置为 **已取消（order_status=4）**；`pay_status` 保持 0 不变。

> **与 `/cancelRefund` 的分工（按支付状态严格分流，勿混用）**：
> - 订单**未支付** → `/cancelOrder`（本接口，只改状态、不退款）
> - 订单**已支付** → `/cancelRefund`（调微信退款，成功后置 已退款 + 已取消）
>
> 若对已支付订单调本接口，会被明确拒绝并返回 `订单已支付，请走退款流程 /cancelRefund`。

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
| v1.6.11 | 2026-10-17 | `POST /cancelRefund`（新增） | 小程序端自助退款接口：**校验订单归属 + 仅「已支付 & 未取车」可退**，成功后订单变「已退款 + 已取消」 | **需要**：订单详情页增加「取消订单并退款」入口，按 `res.code === 200` 判断成功、`res.msg` 提示失败 |
| v1.6.11 | 2026-10-17 | `POST /applyRefund`（**接口已删除**） | 该接口是微信退款 API 的裸透传：不校验订单状态、**退款后不更新订单 pay_status/order_status**（会导致钱退了订单仍是「已支付/待取车」），已下线。退款请用 `POST /cancelRefund` | **需要**：若前端曾接入该接口，必须改为 `/cancelRefund`（旧接口现返回 404） |
| v1.6.11 | 2026-10-17 | `GET /getWxPay` | 更正说明：`totalFee` 单位是**分**（此前文档误写为元；代码与支付回调金额核验口径一直是「分」） | 否（若此前按「元」传参请改为「分」） |
| v1.6.12 | 2026-10-18 | `GET /checkout` | 租用天数改为**按 24 小时向上取整且至少 1 天**（`rentDay` 变整数）；时间倒挂/取还相同/时间非法/保险或司机金额不在白名单均返回 `400 + msg` | **需要**：① 若有依赖小数天数的展示请改为整数；② 新增的 400 错误按 `res.msg` 提示用户 |
| v1.6.12 | 2026-10-18 | `POST /createOrder` | **金额改由服务端重算**，忽略前端传来的 `rentDay`/`rent_total_price`/`total_price`；新增时间与金额白名校验的 400 错误 | **需要**：支付前务必用 `result`（或 `/getOrderDetail`）返回的 `total_price` 下单支付，**不要**用本地计算值，否则支付回调金额核验会失败 |
| v1.7.0 | 2026-10-25 | `GET /tryLogin` | **不再自动注册**：已绑定 openid 仍返回 `200 + result（含 id=uid）`；**未绑定返回 `202 + needPhone:true`，不再创建账号** | **需要**：登录逻辑改为 if code===200 进首页、else if code===202 展示手机号授权按钮走 `/loginByPhone`（否则新用户永远拿不到 uid） |
| v1.7.0 | 2026-10-25 | `GET /loginByPhone`（**新接口，注册主入口**） | 传 `code`（`getPhoneNumber` 回调）+ `openid`(+`unionid`)，服务端换手机号后按手机号注册/登录并绑定 openid，返回 `200 + result（含 id=uid）` | **需要**：登录页加 `<button open-type="getPhoneNumber">`，把 `e.detail.code` 传给本接口；code 一次性，勿缓存 |
| v1.7.0 | 2026-10-25 | `GET /bindPhone`（**新接口**） | 已登录用户补填手机号（`uid` + `code`），老用户（无手机号）可选接入 | 否（可选；若想补齐老用户手机号则接入） |
| v1.6.17 | 2026-10-25 | `GET /getOrderList` | **新增可选筛选参数** `pay_status`、`order_status`（支持逗号分隔多值，非法值忽略，不传则行为不变）；响应**新增可选字段** `total` / `page` / `pageSize`（`result` 仍是订单数组） | **否（向后兼容）**：老版本不传参、只取 `result` 完全不受影响；若要加订单状态 Tab，则按建议传参即可 |
| v1.6.16 | 2026-10-24 | `POST /cancelOrder`（**新接口**） | 取消**未支付**订单（不涉及资金，仅置已取消）。与 `/cancelRefund` 按支付状态分流：未支付走本接口，已支付走 `/cancelRefund` | **需要**：订单列表/详情对「未支付」状态增加「取消订单」入口，调用本接口；已支付订单仍走 `/cancelRefund` |
|---|---|---|---|---|
| v1.6.8 | 2026-10-17 | `POST /createOrder` | 下单前校验车辆上架状态：已下架 → `400 该车辆已下架，暂不可预订`；车辆不存在 → `400 车辆不存在，无法下单`；写入失败 → `500` | **需要**：下单失败判断改为先看 `res.code === 400` 并提示 `res.msg` |
| v1.6.7 | 2026-10-17 | `GET /getCarList` | ① 仅返回上架车辆（`status=1`）；② 排序改为后端按 `sort` 升序；③ 车辆对象新增 `status`、`sort` 字段 | **需要**：移除前端本地排序逻辑，按返回顺序渲染 |
| v1.6.2 | 2026-10-11 | `GET /getIdCardInfo`、`GET /getQrCode` | 服务端 token 缓存缺失不再 500，自动获取后继续处理（参数与响应不变） | 否 |
| v1.6.18 | 2026-10-25 | `GET /checkout` | **计价规则变更**：① 保险费改为**按车辆配置**（后台车辆管理里配低档/高档日单价），新增入参 `insuranceLevel`（`l1`/`l2`，缺省 l1）；② **保险必买**，取消「不买保险」（原 `insurancePrice=0` 的写法不再有效）；③ 整备费改为按车辆配置（默认 50），响应 `clean_price` 不再是固定 1；④ 新增返回字段 `insurance_level` | **需要**：① 结算页去掉「不买保险」选项，改为低/高档二选一并把所选 `insuranceLevel` 传入；② 保险费、整备费的金额文案改为**取接口返回**（`/getInsurancePrice?carId=` 或 `/getCarFee`），别写死；③ 旧的 `insurancePrice` 传金额方式虽兼容，但请尽快改为传 `insuranceLevel`（兼容规则：金额≥100 视为 l2，否则 l1，**实际金额仍按车辆配置**） |
| v1.6.18 | 2026-10-25 | `GET /getInsurancePrice` | 金额改为**按车辆读取配置**（新增建议入参 `carId`，不传返回默认档位），不再是全局固定的 1 / 120 | **需要**：调用时带上 `carId`，并把展示金额改为取接口返回值（**金额会比旧值高很多**，属预期变更） |
| v1.6.18 | 2026-10-25 | `GET /getCarFee`（**新接口**） | 一次返回该车的 `clean_price`（整备费，一次性）与 `insurancePrice_l1`/`l2`（保险日单价） | 否（可选接入，用于结算页展示费用明细） |
| v1.6.18 | 2026-10-25 | `POST /createOrder` | 保险档位由服务端按 `checkOutArray.insurance_level` + 车辆配置重算，前端传的保险金额一律忽略 | **需要**：把 `/checkout` 返回的整包（含 `insurance_level`）原样作为 `checkOutArray` 传入，**不要自行构造**该对象 |
| v1.5.0 | — | `GET /getOrderList`、`GET /getOrderDetail` | 订单新增 `pay_status`（支付状态）、`order_status`（履约状态）、`transaction_id`、`pay_time` | 需要（按新状态枚举展示） |

---

## 7. 联调自测清单

1. 登录（**老用户**）：`wx.login()` → `/getOpenid` → `/tryLogin` → 收 `200` 且 `result.id` 有值（行为与 v1.6.x 一致）
2. 登录（**新用户**）：换一个从未注册过的微信号 → `/getOpenid` → `/tryLogin` 收 `202 needPhone:true`（**确认此时没有新建账号**）→ 手机号授权 → `/loginByPhone?code=&openid=` → 收 `200` 拿到 `uid`
3. 换号验证：用**同一手机号**再换一个微信号授权 → `/loginByPhone` 返回的 `uid` 应与第 2 步**相同**，且该手机号下的订单/驾驶证都在
4. 补手机号（老用户）：`/bindPhone?uid=&code=`，确认返回 `200`；再换设备用该手机号登录应回到同一 `uid`
5. 车辆列表：`/getCarList?pageNum=1`，确认顺序与后台 sort 一致、下架车不出现
6. 结算：`/checkout` 传入取还车时间（毫秒时间戳）→ 确认 `total_price` 正确
7. 下单：`/checkout` 结果整包作为 `checkOutArray` → `/createOrder` → 拿到 `order_sn`
8. 支付：`/getWxPay` → `wx.requestPayment` → `/queryWxPayOrder` 确认 `trade_state=SUCCESS`
9. 订单：`/getOrderList`、`/getOrderDetail` 确认状态展示正确
10. 认证：`/upload` → `/getIdCardInfo` → `/updateUserDriverInfo`（返回 `0` 即成功）
11. 异常：下架某车后从历史入口下单，应收到 `400 该车辆已下架，暂不可预订`
