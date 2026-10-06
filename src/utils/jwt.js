/**
 * JWT 工具（管理后台专用，与 C 端隔离的密钥）
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * 签发管理员 token
 * @param {object} admin { id, username, role }
 */
function signAdminToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    config.adminJwt.secret,
    { expiresIn: config.adminJwt.expiresIn }
  );
}

/**
 * 校验 token，成功返回 payload，失败抛错
 */
function verifyAdminToken(token) {
  return jwt.verify(token, config.adminJwt.secret);
}

module.exports = { signAdminToken, verifyAdminToken };
