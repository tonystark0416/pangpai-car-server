/**
 * 管理后台：用户 CRM（v1.7.14）
 *
 * 运营对指定用户推送小程序订阅消息（新活动上线通知 / 优惠过期提醒）。
 * 模板字段定义由 subscribe.TEMPLATES 统一维护，GET /templates 下发给前端动态渲染表单；
 * 发送走 subscribe.pushToUser（尽力而为，43101 等错误如实返回给运营看）。
 */
const subscribe = require('../../services/wechat/subscribe');

/**
 * 模板定义下发（运营端动态渲染表单用）
 * 字段运行时从微信自动解析（subscribe.getTemplateByKey，带 1 小时缓存）；
 * 模板 ID 未配置（enabled=false）一并下发，前端禁用该选项并提示
 */
async function templates(req, res) {
  const list = [];
  for (const key of Object.keys(subscribe.TEMPLATES)) {
    const meta = subscribe.TEMPLATES[key];
    const tpl = await subscribe.getTemplateByKey(key);
    list.push(
      tpl
        ? { key: tpl.key, name: tpl.name, page: tpl.page, fields: tpl.fields, enabled: true }
        : { key, name: meta.name, page: meta.page, fields: [], enabled: false }
    );
  }
  res.json({ code: 0, data: list });
}

/**
 * 推送给指定用户
 * body: { uid, template_key, data: { 字段key: 值 }, page? }
 * 返回发送结果（ok/errcode/errmsg），失败原因直接给运营展示
 */
async function push(req, res) {
  const { uid, template_key, data, page } = req.body || {};
  if (!uid || !template_key) {
    return res.json({ code: 400, msg: '缺少参数：uid 或 template_key' });
  }
  if (!data || typeof data !== 'object') {
    return res.json({ code: 400, msg: '缺少推送内容 data' });
  }
  const result = await subscribe.pushToUser(Number(uid), String(template_key), data, page);
  res.json({
    code: 0,
    data: {
      ok: result.ok,
      errcode: result.errcode,
      errmsg: result.errmsg,
      msg: result.ok ? '发送成功' : result.errmsg,
    },
  });
}

module.exports = { templates, push };
