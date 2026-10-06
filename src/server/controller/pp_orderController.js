
/**
 * 
 * 订单控制器
 */

const order = require('../model/order.js');
const url = require("url");


/**
 * 创建订单接口
 * @method POST
 * @param {*} req 
 * @param {*} res 
 */
async function createOrder(req, res) {
    if (req.method === 'POST') {
        let body = ''
        // 监听数据接收
        req.on('data', chunk => {
            body += chunk.toString();
        })
        // 数据接收完成
        req.on('end', async () => {
            const data = JSON.parse(body);
            const result = await order.createOrder(data)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: '数据接收成功', result }));

        })

    }
}

/**
 * 分页查询订单列表接口
 * @method GET
 * @param {*} req 
 * @param {*} res 
 */
async function getOrderList(req, res) {
    const path = url.parse(req.url, true).pathname
    const query = url.parse(req.url, true).query
    const pageNumber = query.pageNumber
    const uid = query.uid
    if (path === '/getOrderList') {
        const result = await order.getOrderList(uid, pageNumber)
        if (result[0]) {
            console.log(JSON.stringify({ code: 200, result }))
            res.end(JSON.stringify({ code: 200, result }))
        } else {
            res.end(JSON.stringify({ code: 201, msg: '无订单数据' }))
        }

    } else {
        res.end(JSON.stringify({ code: 201, msg: 'path错误' }))
    }
}

/**
 * 查询订单详情接口
 * @method GET
 * @param {*} req 
 * @param {*} res 
 */
async function getOrderDetail(req, res) {
    const query = url.parse(req.url, true).query
    const orderSn = query.orderSn
    const uid = query.uid
    const result = await order.getOrderDetail(orderSn, uid)
    if (result) {
        console.log(JSON.stringify({ code: 200, result }))
        res.end(JSON.stringify({ code: 200, result }))
    } else {
        res.end(JSON.stringify({ code: 201, msg: '无订单数据' }))
    }

}


module.exports = {
    createOrder,
    getOrderList,
    getOrderDetail
}