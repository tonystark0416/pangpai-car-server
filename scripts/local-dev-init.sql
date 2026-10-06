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
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租赁车辆表';

-- ------------------------------------------------------------
-- 订单表（注意：rent_day/pickup_time/return_time 线上为 varchar）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_order;
CREATE TABLE pp_order (
  id                 INT(10) NOT NULL AUTO_INCREMENT,
  order_sn           VARCHAR(50) NOT NULL COMMENT '订单号',
  uid                INT(10) NOT NULL COMMENT '用户id（adp_user.id）',
  contact_phone      VARCHAR(20) NOT NULL COMMENT '联系电话',
  car_id             INT(10) NOT NULL COMMENT '车辆id',
  rent_day           VARCHAR(5) NOT NULL COMMENT '租车天数',
  rent_day_price     DECIMAL(10,2) NOT NULL COMMENT '每日租金',
  rent_total_price   DECIMAL(10,2) NOT NULL COMMENT '租金总计',
  server_day_price   DECIMAL(10,2) NOT NULL COMMENT '保险每日费用',
  server_total_price DECIMAL(10,2) NOT NULL COMMENT '保险总费用',
  driver_price       DECIMAL(10,2) NOT NULL COMMENT '司机每日费用',
  driver_total_price DECIMAL(10,2) NOT NULL COMMENT '司机总费用',
  total_price        DECIMAL(10,2) NOT NULL COMMENT '订单总价',
  create_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pickup_address     VARCHAR(100) NOT NULL COMMENT '取车地址',
  return_address     VARCHAR(100) NOT NULL COMMENT '还车地址',
  pickup_time        VARCHAR(50) NOT NULL COMMENT '取车时间（毫秒时间戳字符串）',
  return_time        VARCHAR(50) NOT NULL COMMENT '还车时间（毫秒时间戳字符串）',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租车订单表';

-- ------------------------------------------------------------
-- 用户表（多业务线统一用户）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS adp_user;
CREATE TABLE adp_user (
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
  user_id              INT(5) NOT NULL COMMENT '用户id（adp_user.id）',
  driver_idcard_name   VARCHAR(10) DEFAULT NULL COMMENT '驾驶证姓名',
  driver_idcard_number VARCHAR(50) DEFAULT NULL COMMENT '驾驶证号',
  driver_idcard_url    VARCHAR(200) DEFAULT NULL COMMENT '驾驶证图片URL',
  driver_idcard_birth  VARCHAR(20) DEFAULT NULL COMMENT '出生日期',
  create_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='驾驶证信息表';

-- ============================================================
-- 种子数据（本地联调用，字段取自线上结构）
-- ============================================================
INSERT INTO pp_car (car_name, image_url, des, day_price, promotion_day_price) VALUES
('奔驰C级', 'https://pangpai-car.com/uploads/seed/benz-c.png', '舒适轿车', 399.00, 299.00),
('奥迪A6L', 'https://pangpai-car.com/uploads/seed/audi-a6l.png', '商务轿车', 499.00, 399.00),
('别克GL8', 'https://pangpai-car.com/uploads/seed/gl8.png', '7座商务MPV', 658.00, 558.00),
('丰田埃尔法', 'https://pangpai-car.com/uploads/seed/alphard.png', '豪华MPV', 1988.00, 1688.00);
