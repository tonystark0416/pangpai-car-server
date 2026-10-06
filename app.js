/**
 * 庞派汽车小程序后端服务（Express）
 */
const express = require('express');
const config = require('./src/config');
const routes = require('./src/routes');

const app = express();
app.disable('x-powered-by');

// JSON body 解析（微信支付回调为 XML，不受影响）
app.use(express.json());

// 静态图片服务：/images -> 上传目录，缓存 1 小时
app.use('/images', express.static(config.upload.dir, {
  maxAge: '1h',
  fallthrough: false,
}));

// 业务路由
app.use(routes);

// 404（保持原默认行为）
app.use((req, res) => {
  res.status(404).send('no api here!!!');
});

// 全局异常处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('全局异常:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log(
    `服务运行在 http://localhost:${config.port}（图片目录：${config.upload.dir}）`,
    '时间：' + new Date().toLocaleString()
  );
});
