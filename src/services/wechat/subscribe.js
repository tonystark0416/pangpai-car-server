/**
 * 小程序订阅消息发送（v1.7.14）
 *
 * 设计原则：尽力而为，绝不影响主流程。
 * - 一次性订阅「授权一次发一条」，额度微信侧不可查（不做额度记录，以发送结果为准），
 *   43101（未订阅/额度用完）属常态，静默处理；
 * - 模板 ID 未配置（env 未填）→ 直接跳过，连 openid 都不查；
 * - 业务触发点（订单状态变更、CRM 推送）内部全吞异常，调用方无需感知。
 *
 * 模板字段自动获取（v1.7.14 定稿）：
 *   - 通过 GET /wxaapi/newtmpl/gettemplate 拉取账号下全部模板，按 env 配置的模板 ID 匹配；
 *   - 字段从 content 解析：「订单编号:{{character_string9.DATA}}」→ key=character_string9、
 *     label=订单编号、类型=key 前缀（thing/phrase/character_string/time/amount/date）；
 *   - 结果缓存文件（1 小时），拉取失败回退旧缓存；平台改模板后后端自动跟上，无需改代码。
 *
 * 类型校验（微信强校验，防 47003）：
 *   thing ≤20 字符 | phrase ≤5 字符 | character_string ≤32 字符 | time/amount/date 须为合法格式
 */
const config = require('../../config');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const MySQL = require('../../utils/mysql');
const { getAccessTokenCached } = require('./miniprogram');

const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
const LIST_URL = 'https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate';

/** 43101 = 用户未订阅/额度已用完——一次性订阅的常态 */
const ERR_NO_QUOTA = 43101;

/** 字段类型的长度约束（微信硬性校验，超长必报 47003） */
const TYPE_RULES = {
  thing: { max: 20, label: '20字以内' },
  phrase: { max: 5, label: '5字以内' },
  character_string: { max: 32, label: '32字符以内' },
  time: { max: null, label: '时间格式' },
  amount: { max: null, label: '数字金额' },
  date: { max: null, label: '日期格式' },
};

/**
 * 业务模板注册表：key → env 配置 + 默认跳转页 + 业务语义
 * 字段（fields）不再手工维护，运行时从微信自动解析（见 getTemplateByKey）
 */
const TEMPLATES = {
  order_status: {
    name: '订单状态提醒',
    tmplIdKey: 'orderStatusTmplId',
    page: 'pages/orderList/orderList',
  },
  activity: {
    name: '新活动上线通知',
    tmplIdKey: 'activityTmplId',
    page: 'pages/index/index',
  },
  coupon_expire: {
    name: '优惠过期提醒',
    tmplIdKey: 'couponExpireTmplId',
    page: 'pages/index/index',
  },
};

/** content 行解析：「订单编号:{{character_string9.DATA}}」→ {key, label, type} */
function parseContent(content) {
  const fields = [];
  const re = /([^:：\r\n]+)[:：]\s*\{\{(\w+)\.DATA\}\}/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const key = m[2];
    const type = key.replace(/\d+$/, '') || 'thing';
    fields.push({ key, label: m[1].trim(), type, required: true });
  }
  return fields;
}

/* ================= 模板列表缓存（文件缓存 1 小时，拉取失败回退旧缓存） ================= */

const TPL_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const tplCachePath = path.join(config.tokenDir, 'wx_subscribe_templates.json');

/**
 * 拉取并解析微信模板列表（带缓存）
 * @param {boolean} force 强制刷新（跳过缓存有效期）
 * @returns {object|null} { priTmplId: { title, fields: [{key,label,type,required}] } }，失败返回 null
 */
async function fetchRemoteTemplates(force = false) {
  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(tplCachePath, 'utf8'));
  } catch (e) { /* 无缓存 */ }
  if (!force && cache && Date.now() - cache.fetchedAt < TPL_CACHE_MAX_AGE_MS) {
    return cache.templates;
  }
  try {
    const token = await getAccessTokenCached();
    const res = await axios.get(LIST_URL + '?access_token=' + token);
    if (res.data.errcode !== 0) {
      throw new Error('errcode ' + res.data.errcode + ': ' + res.data.errmsg);
    }
    const templates = {};
    for (const t of res.data.data || []) {
      templates[t.priTmplId] = { title: t.title, fields: parseContent(t.content || '') };
    }
    fs.mkdirSync(config.tokenDir, { recursive: true });
    fs.writeFileSync(tplCachePath, JSON.stringify({ fetchedAt: Date.now(), templates }));
    return templates;
  } catch (e) {
    console.error('[subscribe] 拉取模板列表失败:', e.message);
    return cache ? cache.templates : null; // 回退旧缓存（哪怕过期也比没有强）
  }
}

/**
 * 按业务 key 取模板完整定义（模板 ID + 自动解析的字段）
 * @returns {object|null} { key, name, tmplId, page, title, fields }；未配置/拉取失败返回 null
 */
async function getTemplateByKey(key) {
  const tpl = TEMPLATES[key];
  if (!tpl) return null;
  const tmplId = config.subscribe[tpl.tmplIdKey];
  if (!tmplId) return null;
  const remote = await fetchRemoteTemplates();
  const info = remote && remote[tmplId];
  if (!info || !info.fields.length) {
    console.error('[subscribe] 模板字段获取失败:', key, tmplId);
    return null;
  }
  return { key, name: tpl.name, tmplId, page: tpl.page, title: info.title, fields: info.fields };
}

/** 校验数据是否符合模板字段类型（防 47003） */
function validateTemplateData(tpl, values) {
  for (const f of tpl.fields) {
    const v = values[f.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (f.required) return '「' + f.label + '」不能为空';
      continue;
    }
    const rule = TYPE_RULES[f.type];
    if (rule && rule.max && String(v).length > rule.max) {
      return '「' + f.label + '」超出长度限制（' + rule.label + '）';
    }
  }
  return null;
}

/**
 * 通用发送
 * @param {string} openid 接收人 openid（本小程序的）
 * @param {string} templateId 模板 ID
 * @param {object} data 模板关键词数据 { key: { value } }
 * @param {string} [page] 点击跳转的小程序页面路径
 * @returns {{ok: boolean, errcode?: number, errmsg?: string}}
 */
async function sendSubscribe(openid, templateId, data, page) {
  if (!openid || !templateId) {
    return { ok: false, errcode: -1, errmsg: '未配置模板或无 openid，跳过发送' };
  }
  try {
    const token = await getAccessTokenCached();
    const res = await axios.post(SEND_URL + '?access_token=' + token, {
      touser: openid,
      template_id: templateId,
      page,
      data,
      miniprogram_state: config.subscribe.miniprogramState,
      lang: 'zh_CN',
    });
    const d = res.data || {};
    const errcode = d.errcode === undefined ? 0 : d.errcode;
    const errmsg = d.errmsg || 'ok';
    if (errcode === 0) {
      console.log('[subscribe] 发送成功:', templateId, openid);
      return { ok: true, errcode: 0, errmsg: '发送成功' };
    }
    if (errcode === ERR_NO_QUOTA) {
      console.log('[subscribe] 用户未订阅/额度用完:', openid);
      return { ok: false, errcode, errmsg: '用户未订阅该模板或授权额度已用完' };
    }
    console.error('[subscribe] 发送失败:', templateId, openid, errcode, errmsg);
    return { ok: false, errcode, errmsg: '微信返回错误 ' + errcode + ': ' + errmsg };
  } catch (e) {
    console.error('[subscribe] 发送异常:', e.message);
    return { ok: false, errcode: -2, errmsg: '发送异常: ' + e.message };
  }
}

/**
 * 按 uid 查 openid（pp_user_auth，biz_code 区分多小程序）
 * @returns {string|null}
 */
async function getOpenidByUid(uid) {
  if (!uid) return null;
  const db = new MySQL();
  try {
    const rows = await db.query(
      'SELECT openid FROM pp_user_auth WHERE user_id = ? AND biz_code = ? LIMIT 1',
      [uid, config.biz.code]
    );
    return rows[0] ? rows[0].openid : null;
  } catch (e) {
    console.error('[subscribe] 查 openid 失败:', e.message);
    return null;
  } finally {
    db.close();
  }
}

/**
 * 用户 CRM 推送（v1.7.14）：按模板 key 发送，运营在后台填写字段值
 * @param {number} uid 目标用户
 * @param {string} templateKey TEMPLATES 的 key
 * @param {object} values { 字段key: 值 }（运营在表单里填的）
 * @param {string} [page] 覆盖默认跳转页（可选）
 * @returns {{ok, errcode, errmsg}}
 */
async function pushToUser(uid, templateKey, values = {}, page) {
  const tpl = await getTemplateByKey(templateKey);
  if (!tpl) return { ok: false, errcode: -1, errmsg: '模板未配置或字段获取失败' };
  const err = validateTemplateData(tpl, values);
  if (err) return { ok: false, errcode: -1, errmsg: err };
  try {
    const openid = await getOpenidByUid(uid);
    if (!openid) return { ok: false, errcode: -1, errmsg: '该用户未绑定微信 openid，无法推送' };
    const data = {};
    for (const f of tpl.fields) {
      if (values[f.key] !== undefined && values[f.key] !== null && String(values[f.key]).trim() !== '') {
        data[f.key] = { value: String(values[f.key]).trim() };
      }
    }
    return await sendSubscribe(openid, tpl.tmplId, data, page || tpl.page);
  } catch (e) {
    console.error('[subscribe] CRM 推送异常:', e.message);
    return { ok: false, errcode: -2, errmsg: '推送异常: ' + e.message };
  }
}

/**
 * 订单状态提醒（v1.7.14）：后台订单改为已取车/已还车时触发
 * 模板字段（订单状态通知）：character_string9 订单编号 / phrase14 订单状态 / thing4 温馨提醒
 * @param {object} order 订单行（须含 uid / order_sn / car_name?）
 * @param {string} statusText '已取车' | '已还车'
 * @returns {{ok, errcode, errmsg}|null} 模板未配置返回 null
 */
async function sendOrderStatusNotify(order, statusText) {
  const tpl = await getTemplateByKey('order_status');
  if (!tpl) return null;
  try {
    const openid = await getOpenidByUid(order.uid);
    if (!openid) return { ok: false, errcode: -1, errmsg: '用户未绑定 openid' };
    const carName = String(order.car_name || '租车订单').slice(0, 20);
    const tips = statusText === '已取车'
      ? '祝您用车愉快，请留意还车时间'
      : '感谢使用，期待下次为您服务';
    return await sendSubscribe(openid, tpl.tmplId, {
      character_string9: { value: String(order.order_sn).slice(0, 32) },
      phrase14: { value: statusText },
      thing4: { value: ('车辆：' + carName + '，' + tips).slice(0, 20) },
    }, tpl.page);
  } catch (e) {
    console.error('[subscribe] 订单状态通知异常:', e.message);
    return { ok: false, errcode: -2, errmsg: '发送异常: ' + e.message };
  }
}

module.exports = {
  sendSubscribe,
  pushToUser,
  sendOrderStatusNotify,
  getOpenidByUid,
  getTemplateByKey,
  fetchRemoteTemplates,
  TEMPLATES,
  parseContent,
  validateTemplateData,
};
