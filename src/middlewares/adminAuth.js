/**
 * 管理后台鉴权中间件：校验 Bearer JWT
 */
const { verifyAdminToken } = require('../utils/jwt');

module.exports = function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 401, msg: '未登录' });
  }

  try {
    req.admin = verifyAdminToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ code: 401, msg: '登录已过期，请重新登录' });
  }
};
