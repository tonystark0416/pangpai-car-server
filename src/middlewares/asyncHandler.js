/**
 * async 路由包装器：把异步异常交给 Express 全局错误中间件处理
 * 用法：router.get('/xxx', asyncHandler(controller.fn))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
