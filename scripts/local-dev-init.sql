-- ============================================================
-- 庞派汽车 本地开发环境初始化脚本
-- 用途：在本地 MySQL 重建业务表并写入种子数据（生产环境勿用！）
-- 执行：mysql -uroot -p -h 127.0.0.1 --default-character-set=utf8mb4 < scripts/local-dev-init.sql
-- 表结构依据 models 层 SQL 反推，字段名以生产库为准，
-- 若后续拿到生产库 dump，请以 dump 为准覆盖本地。
-- ============================================================

CREATE DATABASE IF NOT EXISTS pangpai DEFAULT CHARACTER SET utf8mb4;
USE pangpai;

-- ------------------------------------------------------------
-- 车辆表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_car;
CREATE TABLE pp_car (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  car_name             VARCHAR(64)  NOT NULL COMMENT '车辆名称',
  brand                VARCHAR(32)  DEFAULT NULL COMMENT '品牌',
  car_model            VARCHAR(64)  DEFAULT NULL COMMENT '车型',
  seats                TINYINT UNSIGNED DEFAULT 5 COMMENT '座位数',
  gear_box             VARCHAR(16)  DEFAULT '自动' COMMENT '变速箱',
  car_image            VARCHAR(255) DEFAULT NULL COMMENT '车辆图片URL',
  promotion_day_price  DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '每日租金（促销价）',
  original_day_price   DECIMAL(10,2) DEFAULT NULL COMMENT '每日租金（原价）',
  deposit              DECIMAL(10,2) DEFAULT 0 COMMENT '押金',
  status               TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1上架 0下架',
  create_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租赁车辆表';

-- ------------------------------------------------------------
-- 订单表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_order;
CREATE TABLE pp_order (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_sn            VARCHAR(32) NOT NULL COMMENT '订单号',
  uid                 INT UNSIGNED NOT NULL COMMENT '用户id（adp_user.id）',
  contact_phone       VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
  car_id              INT UNSIGNED NOT NULL COMMENT '车辆id',
  rent_day            DECIMAL(10,2) DEFAULT NULL COMMENT '租车天数',
  rent_day_price      DECIMAL(10,2) DEFAULT NULL COMMENT '每日租金',
  rent_total_price    DECIMAL(10,2) DEFAULT NULL COMMENT '租金总计',
  server_day_price    DECIMAL(10,2) DEFAULT NULL COMMENT '保险每日费用',
  server_total_price  DECIMAL(10,2) DEFAULT NULL COMMENT '保险总费用',
  driver_price        DECIMAL(10,2) DEFAULT NULL COMMENT '司机每日费用',
  driver_total_price  DECIMAL(10,2) DEFAULT NULL COMMENT '司机总费用',
  total_price         DECIMAL(10,2) DEFAULT NULL COMMENT '订单总价',
  pickup_address      VARCHAR(255) DEFAULT NULL COMMENT '取车地址',
  return_address      VARCHAR(255) DEFAULT NULL COMMENT '还车地址',
  pickup_time         BIGINT DEFAULT NULL COMMENT '取车时间（毫秒时间戳）',
  return_time         BIGINT DEFAULT NULL COMMENT '还车时间（毫秒时间戳）',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_sn (order_sn),
  KEY idx_uid (uid),
  KEY idx_car (car_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租车订单表';

-- ------------------------------------------------------------
-- 用户表（多业务线统一用户）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS adp_user;
CREATE TABLE adp_user (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  biz_code     VARCHAR(32)  DEFAULT NULL COMMENT '业务线编码',
  phone        VARCHAR(20)  DEFAULT NULL COMMENT '手机号',
  openid       VARCHAR(64)  DEFAULT NULL COMMENT '微信openid',
  create_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_phone (phone),
  KEY idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一用户表';

-- ------------------------------------------------------------
-- 驾驶证信息表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS pp_driver;
CREATE TABLE pp_driver (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL COMMENT '用户id（adp_user.id）',
  driver_idcard_name  VARCHAR(64)  DEFAULT NULL COMMENT '驾驶证姓名',
  driver_idcard_number VARCHAR(32) DEFAULT NULL COMMENT '驾驶证号',
  driver_idcard_url   VARCHAR(255) DEFAULT NULL COMMENT '驾驶证图片URL',
  driver_idcard_birth VARCHAR(16)  DEFAULT NULL COMMENT '出生日期',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='驾驶证信息表';

-- ============================================================
-- 种子数据（本地联调用）
-- ============================================================
INSERT INTO pp_car (car_name, brand, car_model, seats, gear_box, car_image, promotion_day_price, original_day_price, deposit, status) VALUES
('丰田凯美瑞', '丰田', '凯美瑞 2.5G 豪华版', 5, '自动', 'https://pangpai-car.com/uploads/seed/camry.png', 299.00, 399.00, 3000.00, 1),
('特斯拉 Model 3', '特斯拉', 'Model 3 长续航版', 5, '自动', 'https://pangpai-car.com/uploads/seed/model3.png', 499.00, 599.00, 5000.00, 1),
('别克 GL8', '别克', 'GL8 ES 陆尊', 7, '自动', 'https://pangpai-car.com/uploads/seed/gl8.png', 658.00, 758.00, 8000.00, 1),
('丰田埃尔法', '丰田', '埃尔法 双擎 2.5L', 7, '自动', 'https://pangpai-car.com/uploads/seed/alphard.png', 1688.00, 1988.00, 20000.00, 1);
