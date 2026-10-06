
/**
 * 接收企业微信回调，不处理业务逻辑 https://developer.work.weixin.qq.com/document/path/90238
 */


const url = require("url");


function verifyWorkCallback(req, res) {

    let urlObj = url.parse(req.url, true);
    let query = urlObj.query; //get参数
    console.log(query)
    // let path = urlObj.pathname; //url路径
    res.end('4444')

}


function workCallback(query, res) {


}



/**
 * 导出模块
 */
module.exports = {
    workCallback,
    verifyWorkCallback
}