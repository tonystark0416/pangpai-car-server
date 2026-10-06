/**
 * 庞派汽车小程序结算接口，主要用途是用来计算价格
 * 一般在提交订单前在结算页面调用
 */

const car = require('../model/car.js')


function checkout(query, res) {
    //获取query的结算参数
    const uid = query.uid
    const contact_phone = query.contact_phone
    const carId = query.carId
    const pickUpTime = query.pickUpTime
    const pickUpAddress = query.pickUpAddress
    const returnTime = query.returnTime
    const returnAddress = query.returnAddress
    const insurancePrice = query.insurancePrice
    const driver_price = query.driver_price
    console.log(query.insurancePrice)
    if (!uid || !carId) {
        console.log('参数缺失')
        res.end('{"code":-1,"msg":"参数缺失"}');
    } else {
        car.getCarInfo(carId).then((data) => {
            //计价
            let rent_day_price = data.promotion_day_price; //每日租金
            let rentDay = (returnTime - pickUpTime) / (1000 * 60 * 60 * 24);//租车天数
            let rent_total_price = rent_day_price * rentDay; //车辆租金
            let clean_price = 1; //整备费用
            let server_day_price = insurancePrice; //保险一日费用
            let server_total_price = server_day_price * rentDay; //保险总费用
            let door_pickup_price = 0;
            let door_return_price = 0;
            let driver_total_price = driver_price * rentDay;
            let total_price = rent_total_price + clean_price + server_total_price + door_pickup_price + door_return_price + driver_total_price;
            const result = {
                // code:200,
                uid: uid,
                contact_phone: contact_phone,
                data: data,
                rent_day_price,
                rentDay,
                rent_total_price,
                clean_price,
                server_day_price,
                server_total_price,
                door_pickup_price,
                door_return_price,
                driver_price,
                driver_total_price,
                total_price,
                pickUpAddress,
                returnAddress,
                pickUpTime,
                returnTime
            }
            console.log(result)
            res.end(JSON.stringify(result))
        })

    }
}

/**
 * 获取保险价格
 */
function getInsurancePrice(query, res) {
    const result = {
        code: 200,
        insurancePrice_l1: 1,
        insurancePrice_l2: 120,
    }
    res.end(JSON.stringify(result))
}


/**
 * 获取司机价格
 */
function getDriverPrice(query, res) {
    const result = {
        code: 200,
        driver_price: 400
    }
    res.end(JSON.stringify(result))
}

module.exports = {
    checkout,
    getInsurancePrice,
    getDriverPrice
}
