/**
 * 汽车相关controller逻辑处理
 * 
 */

const car = require('../model/car.js')


function getCarList(query, res) {
    const pageNum = query.pageNum
    if (pageNum) {
        car.getCarList(pageNum).then((data) => {
            const result = {
                code: 0,
                list: data
            }
            console.log(JSON.stringify(result))
            res.end(JSON.stringify(result))
        })
    } else {
        res.end('参数错误')
    }
}



module.exports = {
    getCarList
}