/**
 * 车辆数据访问层
 */
const MySQL = require('../utils/mysql.js');

/**
 * 分页获取汽车列表
 * @param {int} pageNumber
 * @returns
 */
async function getCarList(pageNumber) {
    if (pageNumber == 0) {
        console.log('页码不能为0');
        return -1;
    }
    const db = new MySQL();
    const pageSize = 10; // 每页显示的记录数
    const offset = (pageNumber - 1) * pageSize; // 计算偏移量
    const sql_getCarList = "select * from pp_car order by update_time desc limit ?,?";
    try {
        const result = await db.query(sql_getCarList, [offset, pageSize]);
        return result;
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

/**
 * 获取单个汽车信息
 * @param {*} carId
 * @returns
 */
async function getCarInfo(carId) {
    if (!carId) {
        return -1;
    }
    const db = new MySQL();
    const sql_getCarInfo = "select * from pp_car where id = ?";
    try {
        const result = await db.query(sql_getCarInfo, carId);
        return result[0];
    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

module.exports = {
    getCarList,
    getCarInfo,
};
