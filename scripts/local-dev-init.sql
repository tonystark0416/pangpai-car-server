-- ============================================================
-- 庞派汽车 本地开发环境初始化脚本
-- 用途：在本地 MySQL 重建业务表并写入种子数据（生产环境勿用！）
-- 表结构与线上生产库（mike）完全一致（2026-10-07 校准）
-- 执行：mysql -uroot -p -h 127.0.0.1 --default-character-set=utf8mb4 < scripts/local-dev-init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS mike DEFAULT CHARACTER SET utf8mb4;
USE mike;

-- ------------------------------------------------------------
-- 车辆表（线上结构：utf8mb4）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_car;
CREATE TABLE pp_car (
  id                  INT(10) NOT NULL AUTO_INCREMENT,
  car_name            VARCHAR(50) NOT NULL COMMENT '车辆名称',
  image_url           VARCHAR(200) NOT NULL COMMENT '车辆图片URL',
  des                 VARCHAR(100) DEFAULT NULL COMMENT '描述',
  day_price           DECIMAL(10,2) NOT NULL COMMENT '每日租金（原价）',
  promotion_day_price DECIMAL(10,2) DEFAULT NULL COMMENT '每日租金（促销价，结算计价用此字段）',
  -- v1.6.18：每辆车单独配置费用
  clean_price         DECIMAL(10,2) NOT NULL DEFAULT 50 COMMENT '整备费（按订单一次性收取，不乘天数）',
  insurance_price_l1  DECIMAL(10,2) NOT NULL DEFAULT 100 COMMENT '低档保险日单价（× 天数）',
  insurance_price_l2  DECIMAL(10,2) NOT NULL DEFAULT 200 COMMENT '高档保险日单价（× 天数）',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status              TINYINT NOT NULL DEFAULT 1 COMMENT '上下架状态：1上架 0下架（v1.6.7）',
  sort                INT NOT NULL DEFAULT 100 COMMENT '排序值：1~10000，越小越靠前（v1.6.7）',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租赁车辆表';

-- ------------------------------------------------------------
-- 订单表（注意：rent_day/pickup_time/return_time 线上为 varchar）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_order;
-- 注释与线上生产库保持一致（v1.6.6 统一补齐并修正 v1.5.0 的编码乱码）
CREATE TABLE pp_order (
  id                 INT(10) NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  order_sn           VARCHAR(50) NOT NULL COMMENT '订单号（PP+yyyyMMddHHmmss）',
  uid                INT(10) NOT NULL COMMENT '下单用户ID（pp_user.id）',
  contact_phone      VARCHAR(20) NOT NULL COMMENT '联系电话',
  car_id             INT(10) NOT NULL COMMENT '车辆ID（pp_car.id）',
  rent_day           VARCHAR(5) NOT NULL COMMENT '租车天数（字符串）',
  rent_day_price     DECIMAL(10,2) NOT NULL COMMENT '车辆日租金单价',
  clean_price        DECIMAL(10,2) NOT NULL DEFAULT 1 COMMENT '整备费快照（下单时按车辆配置写入）',
  rent_total_price   DECIMAL(10,2) NOT NULL COMMENT '车辆租金合计',
  server_day_price   DECIMAL(10,2) NOT NULL COMMENT '保险费单价（每天）',
  server_total_price DECIMAL(10,2) NOT NULL COMMENT '保险费合计',
  driver_price       DECIMAL(10,2) NOT NULL COMMENT '司机服务费单价（每天）',
  driver_total_price DECIMAL(10,2) NOT NULL COMMENT '司机服务费合计',
  total_price        DECIMAL(10,2) NOT NULL COMMENT '订单总价',
  pay_status         TINYINT NOT NULL DEFAULT 0 COMMENT '支付状态：0待支付 1已支付 2已退款 3支付失败',
  transaction_id     VARCHAR(32) DEFAULT NULL COMMENT '微信支付单号',
  pay_time           DATETIME DEFAULT NULL COMMENT '支付时间',
  order_status       TINYINT NOT NULL DEFAULT 0 COMMENT '履约状态：0待取车 1已取车 2已还车 3已完成 4已取消',
  create_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  pickup_address     VARCHAR(100) NOT NULL COMMENT '取车地址',
  return_address     VARCHAR(100) NOT NULL COMMENT '还车地址',
  pickup_time        VARCHAR(50) NOT NULL COMMENT '取车时间（毫秒时间戳字符串）',
  return_time        VARCHAR(50) NOT NULL COMMENT '还车时间（毫秒时间戳字符串）',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租车订单表';

-- ------------------------------------------------------------
-- 用户表（v1.6.15 起庞派独立：原 adp_user 留给其他项目）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_user;
CREATE TABLE pp_user (
  id           INT(10) NOT NULL AUTO_INCREMENT,
  biz_code     VARCHAR(11) DEFAULT NULL COMMENT '业务线编码',
  username     VARCHAR(20) DEFAULT NULL,
  password     VARCHAR(255) DEFAULT NULL,
  nickname     VARCHAR(50) DEFAULT NULL,
  avatar       VARCHAR(255) DEFAULT NULL,
  openid       VARCHAR(50) DEFAULT NULL COMMENT '微信openid',
  phone        VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  create_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一用户表';

-- ------------------------------------------------------------
-- 驾驶证信息表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_driver;
CREATE TABLE pp_driver (
  id                   INT(5) NOT NULL AUTO_INCREMENT,
  user_id              INT(5) NOT NULL COMMENT '用户id（pp_user.id）',
  driver_idcard_name   VARCHAR(10) DEFAULT NULL COMMENT '驾驶证姓名',
  driver_idcard_number VARCHAR(50) DEFAULT NULL COMMENT '驾驶证号',
  driver_idcard_url    VARCHAR(200) DEFAULT NULL COMMENT '驾驶证图片URL',
  driver_idcard_birth  VARCHAR(20) DEFAULT NULL COMMENT '出生日期',
  create_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='驾驶证信息表';

-- ------------------------------------------------------------
-- 用户授权表（v1.4.0）：一个小程序一行；v1.6.15 起归属 pp_user
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_user_auth;
CREATE TABLE pp_user_auth (
  id          INT(10) NOT NULL AUTO_INCREMENT,
  user_id     INT(10) NOT NULL COMMENT '关联 pp_user.id',
  biz_code    VARCHAR(11) NOT NULL DEFAULT 'pp' COMMENT '业务编码：pp=租车小程序',
  app_id      VARCHAR(32) DEFAULT NULL COMMENT '小程序appid（预留）',
  openid      VARCHAR(50) NOT NULL COMMENT '该小程序下的openid',
  unionid     VARCHAR(50) DEFAULT NULL COMMENT '微信unionid（跨小程序识别同一用户，待开放平台关联后启用）',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_biz_openid (biz_code, openid),
  KEY idx_user (user_id),
  KEY idx_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户授权表（一个小程序一行）';

-- ============================================================
-- 种子数据（本地联调用，字段取自线上结构）
-- ============================================================
INSERT INTO pp_car (car_name, image_url, des, day_price, promotion_day_price) VALUES
('奔驰C级', 'https://pangpai-car.com/uploads/seed/benz-c.png', '舒适轿车', 399.00, 299.00),
('奥迪A6L', 'https://pangpai-car.com/uploads/seed/audi-a6l.png', '商务轿车', 499.00, 399.00),
('别克GL8', 'https://pangpai-car.com/uploads/seed/gl8.png', '7座商务MPV', 658.00, 558.00),
('丰田埃尔法', 'https://pangpai-car.com/uploads/seed/alphard.png', '豪华MPV', 1988.00, 1688.00);
