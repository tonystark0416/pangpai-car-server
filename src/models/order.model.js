/**
 * 订单文件，用来描述一个订单的构成，以及提供订单的基本方法
 */
const format = require('date-fns');
const MySQL = require('../utils/mysql.js');
const car = require('./car.model.js');

/**
 * 创建订单
 * v1.6.8：下单前校验车辆上架状态，已下架车辆不允许下单
 * v1.6.12：**金额以服务端计价结果为准**，不再采信前端传来的价格
 * @param {*} checkOutData 结算计价信息整个传入
 * @param {object} price pricing.service.calcOrderPrice 的返回（服务端权威计价）
 * @returns 订单对象；-2=车辆不存在；-3=车辆已下架；undefined=写入失败
 */
async function createOrder(checkOutData, price) {
    const db = new MySQL();
    const order_sn = genOrderSn(); //获取订单号
    const sqlCreateOrder = 'INSERT INTO pp_order (order_sn,uid,contact_phone,car_id,rent_day,rent_day_price,rent_total_price,server_day_price,server_total_price,driver_price,driver_total_price,total_price,pickup_address,return_address,pickup_time,return_time) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    const orderData = checkOutData.checkOutArray;

    // 车辆可用性校验：不存在 / 已下架（status=0）均拒绝下单
    const carInfo = await car.getCarInfo(orderData.data && orderData.data.id);
    if (!carInfo) {
        return -2;
    }
    if (Number(carInfo.status) !== 1) {
        return -3;
    }

    try {
        // 天数与各项金额一律取服务端重算结果
        const res = await db.query(sqlCreateOrder, [order_sn, orderData.uid, orderData.contact_phone, orderData.data.id, price.rentDay, price.rent_day_price, price.rent_total_price, price.server_day_price, price.server_total_price, price.driver_price, price.driver_total_price, price.total_price, orderData.pickUpAddress, orderData.returnAddress, orderData.pickUpTime, orderData.returnTime]);

        if (res.affectedRows > 0) {
            const sqlSelectOrder = 'select * from pp_order where id = ?';
            const result = await db.query(sqlSelectOrder, res.insertId);
            if (result[0]) {
                return result[0];
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

/**
 * 生成订单号函数
 * @returns orderSn
 */
function genOrderSn() {
    const moment = require('moment');
    const currentTime = moment().format('YYYYMMDDHHmmss');
    return 'PP' + currentTime;
}

/**
 * 获取订单列表
 * @param {int} pageNumber
 */
async function getOrderList(uid, pageNumber) {
    //校验页码，不能为0
    if (pageNumber == 0) {
        console.log('页码不能为0');
        return -1;
    }
    const pageSize = 10; // 每页显示的记录数
    const offset = (pageNumber - 1) * pageSize; // 计算偏移量
    const db = new MySQL();
    const sqlGetOrderList = 'select * from pp_order where uid = ? order by create_time desc limit ?,?';
    try {
        const res = await db.query(sqlGetOrderList, [uid, offset, pageSize]);
        return res;
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

/**
 * 获取订单详情
 * @param {string} order_sn
 * @returns
 */
async function getOrderDetail(order_sn, uid) {
    const db = new MySQL();
    const sqlGetOrderDetail = 'select * from pp_order where order_sn = ? and uid = ?';
    try {
        let res = await db.query(sqlGetOrderDetail, [order_sn, uid]);
        res = res[0]; //查询结果数据的第一个
        if (res) {
            const carInfo = await car.getCarInfo(res.car_id);
            res['carInfo'] = carInfo;
            //时间转换，前端不用转
            res['create_time'] = format.format(new Date(res['create_time']), 'yyyy-MM-dd HH:mm:ss');
            res['update_time'] = format.format(new Date(res['update_time']), 'yyyy-MM-dd HH:mm:ss');
            res['pickup_time'] = format.format(new Date(parseInt(res['pickup_time'])), 'yyyy-MM-dd HH:mm:ss');
            res['return_time'] = format.format(new Date(parseInt(res['return_time'])), 'yyyy-MM-dd HH:mm:ss');
            return res;
        }
    } catch (error) {
        console.error(error);
        return -1;
    } finally {
        db.close();
    }
}

/**
 * 按订单号查询订单（支付回调核验用）
 * @param {string} order_sn
 */
async function getOrderBySn(order_sn) {
    const db = new MySQL();
    const sqlGetOrder = 'select * from pp_order where order_sn = ?';
    try {
        const res = await db.query(sqlGetOrder, [order_sn]);
        return res[0];
    } catch (error) {
        console.error('[order] getOrderBySn error:', error);
    } finally {
        db.close();
    }
}

/**
 * 标记订单已支付（支付回调落库，幂等）
 * 仅当 pay_status=0 时更新，微信重复通知不会重复写
 * @param {string} order_sn 商户订单号
 * @param {string} transaction_id 微信支付订单号
 * @param {string} timeEnd 微信回调 time_end（YYYYMMDDHHmmss）
 * @returns affectedRows：1=本次落库成功；0=已支付过或订单不存在
 */
async function markOrderPaid(order_sn, transaction_id, timeEnd) {
    const db = new MySQL();
    const payTime = timeEnd
        ? `${timeEnd.slice(0, 4)}-${timeEnd.slice(4, 6)}-${timeEnd.slice(6, 8)} ${timeEnd.slice(8, 10)}:${timeEnd.slice(10, 12)}:${timeEnd.slice(12, 14)}`
        : null;
    const sqlMarkPaid = 'UPDATE pp_order SET pay_status = 1, transaction_id = ?, pay_time = ? WHERE order_sn = ? AND pay_status = 0';
    try {
        const res = await db.query(sqlMarkPaid, [transaction_id, payTime, order_sn]);
        return res.affectedRows;
    } catch (error) {
        console.error('[order] markOrderPaid error:', error);
        return -1;
    } finally {
        db.close();
    }
}

/**
 * 标记订单已退款（退款成功后落库）
 * v1.6.11：pay_status=2（已退款）+ order_status=4（已取消）
 * @param {string} order_sn 商户订单号
 * @returns affectedRows：1=落库成功；0=订单不存在
 */
async function markOrderRefunded(order_sn) {
    const db = new MySQL();
    const sqlMarkRefunded = 'UPDATE pp_order SET pay_status = 2, order_status = 4 WHERE order_sn = ?';
    try {
        const res = await db.query(sqlMarkRefunded, [order_sn]);
        return res.affectedRows;
    } catch (error) {
        console.error('[order] markOrderRefunded error:', error);
        return -1;
    } finally {
        db.close();
    }
}

module.exports = {
    createOrder,
    getOrderDetail,
    getOrderList,
    getOrderBySn,
    markOrderPaid,
    markOrderRefunded,
};
