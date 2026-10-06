const mysql = require('mysql2');
const config = require('../config');

class MySQL {

  constructor() {
    this.connection = mysql.createConnection(config.mysql);
    // 捕获连接级致命错误（如网络中断），避免未处理的 error 事件导致进程崩溃
    this.connection.on('error', (err) => {
      console.error('MySQL 连接错误:', err.code || err.message);
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.connection.connect((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  query(sql, values) {
    return new Promise((resolve, reject) => {
      this.connection.query(sql, values, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      try {
        this.connection.end(() => resolve());
      } catch (e) {
        // 连接已断开/关闭时 end() 会同步抛错，忽略即可
        resolve();
      }
    });
  }
}

module.exports = MySQL;
