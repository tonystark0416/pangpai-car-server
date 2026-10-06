// 示例配置：复制本文件为 mysql_config.js 并填入真实值
const mysql_config = {
  host: 'localhost',
  user: 'your_db_user',
  password: 'your_db_password',
  database: 'your_db_name',
  charset: "UTF8_GENERAL_CI", // 连接字符集
  connectTimeout: 10000, // 连接超时时间（毫秒）
  multipleStatements: false
};

module.exports = mysql_config;
