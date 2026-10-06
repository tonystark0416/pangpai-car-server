const http = require('http');
// const https = require('https');
const url = require("url");
const fs = require('fs');
const pp_userController = require('./src/server/controller/pp_userController.js');
const pp_orderController = require('./src/server/controller/pp_orderController.js');
const car = require('./src/server/controller/pp_carController.js');
const checkout = require('./src/server/controller/pp_checkoutController.js');
const up = require('./src/util/upload.js');
const img = require('./src/util/image.js');
const wx = require('./src/server/base/weixin-api.js');
const paymentController = require('./src/server/controller/paymentController');
const wxServiceController = require('./src/server/admin/wxServiceController.js');
const workCallback = require('./src/server/controller/workWeixinCallback');


// 读取证书文件，之前用nodejs原生https，所以需要
// const options = {
//     // timeout: 60000,
//     key: fs.readFileSync('./https/pangpai-car.com.key'),
//     cert: fs.readFileSync('./https/pangpai-car.com_bundle.crt')
// }


//处理请求的回调函数
const serverHandle = (req, res) => {

    //处理图片
    if (req.url.startsWith('/images/')) {
        img.showImage(req, res)
        return
    }

    // 拿到 req 里面的 url 信息，并解析
    let urlObj = url.parse(req.url, true);
    let query = urlObj.query; //get参数
    let path = urlObj.pathname; //url路径
    // console.log(urlObj)
    switch (path) {
        case '/workWeixinCallback':
            workCallback.verifyWorkCallback(req, res)
            break;
        case '/getQrCode':
            wxServiceController.getUnlimitedQRCode(query, res)
            break;
        case '/wxPayCallback':
            paymentController.handlePaymentNotify(req, res)
            break;
        case '/getWxPay':
            paymentController.createJsapiPayment(req, res)
            break;
        case '/getOrderList':
            pp_orderController.getOrderList(req, res)
            break;
        case '/getOrderDetail':
            pp_orderController.getOrderDetail(req, res)
            break;
        case '/createOrder':
            pp_orderController.createOrder(req, res)
            break;
        case '/updateUserDriverInfo':
            pp_userController.updateUserDriverInfo(query, res)
            break;
        case '/getUserDriverInfo':
            pp_userController.getUserDriverInfo(query, res)
            break;
        case '/getIdCardInfo':
            wx.getIdCardInfo(query, res)
            break;
        case '/upload':
            up.uploadFile(req, res)
            break;
        case '/getOpenid':
            pp_userController.getOpenid(query, res)
            break;
        case '/tryLogin':
            pp_userController.openid_tryLogin(query, res)
            break;
        case '/getCarList':
            car.getCarList(query, res)
            break;
        case '/checkout':
            checkout.checkout(query, res)
            break;
        case '/getInsurancePrice':
            checkout.getInsurancePrice(query, res)
            break;
        case '/getDriverPrice':
            checkout.getDriverPrice(query, res)
            break;
        case '/favicon.ico':
            res.end();
            break;

        default:
            res.end('no api here!!!')
            break;
    }

}

// 监听端口,创建服务器
const server = http.createServer(serverHandle)

server.listen(3002, () => {
    console.log(
        "服务运行在http://localhost:3002",
        "时间：" + new Date().toLocaleString()
    );
})