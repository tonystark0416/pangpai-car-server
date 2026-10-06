/**
 * 管理后台：认证（登录 / 当前信息）
 */
const bcrypt = require('bcryptjs');
const adminModel = require('../../models/admin.model');
const { signAdminToken } = require('../../utils/jwt');

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ code: 400, msg: '请输入账号和密码' });
  }

  const admin = await adminModel.getAdminByUsername(username);
  if (!admin || admin.status !== 1) {
    return res.json({ code: 400, msg: '账号不存在或已停用' });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.json({ code: 400, msg: '账号或密码错误' });
  }

  const token = signAdminToken(admin);
  adminModel.updateLastLogin(admin.id).catch((e) => console.error('[admin] 更新登录时间失败:', e.message));

  res.json({
    code: 0,
    data: {
      token,
      admin: { id: admin.id, username: admin.username, nickname: admin.nickname, role: admin.role },
    },
  });
}

async function profile(req, res) {
  const admin = await adminModel.getAdminById(req.admin.id);
  if (!admin) {
    return res.status(401).json({ code: 401, msg: '账号不存在' });
  }
  res.json({ code: 0, data: admin });
}

module.exports = { login, profile };
