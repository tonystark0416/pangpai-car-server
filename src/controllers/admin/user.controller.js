/**
 * 管理后台：用户管理
 */
const adminModel = require('../../models/admin.model');

async function list(req, res) {
  const { page, pageSize, keyword } = req.query;
  const data = await adminModel.getUserList({ page, pageSize, keyword });
  res.json({ code: 0, data });
}

async function detail(req, res) {
  const data = await adminModel.getUserDetail(req.params.id);
  if (!data) {
    return res.json({ code: 404, msg: '用户不存在' });
  }
  res.json({ code: 0, data });
}

module.exports = { list, detail };
