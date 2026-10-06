/* 
对接京东联盟接口
接口调用教程https://union.jd.com/searchResultDetail?articleId=108188
首先要获取sign值，再拼接请求参数get请求整个地址
*/
const moment = require('moment');
const CryptoJS = require("crypto-js");
const axios = require('axios');

/* 
系统请求参数，全部方法都一样
*/
const systemParam = {
    app_key:'71ca21c41fcd3a2019410a17148ffd72',
    app_secret:'7ed8875673d44009aa92c6822371f36e',
    format:'json',
    sign_method:'md5',
    v:'1.0',
}

/**
 * 组装签名
 * @param {*} businessParam 
 * @param {*} method 
 * @returns 
 */
const getSign = (businessParam,method)=>{
    sign = '360buy_param_json'+businessParam;
    sign += 'app_key'+systemParam.app_key;
    sign += 'method'+method;
    sign += 'sign_method'+systemParam.sign_method;
    sign += 'timestamp'+moment().format('YYYY-MM-DD HH:mm:ss');
    sign += 'v'+systemParam.v;
    sign = systemParam.app_secret+sign+systemParam.app_secret;
    sign = CryptoJS.MD5(sign).toString().toUpperCase();
    // console.log(sign)
    return sign
}

/**
 * 组装请求参数
 * @param {*} sign 
 * @param {*} businessParam 
 * @returns 
 */
const getQueryString = (sign,businessParam,method) =>{
    params = '';
    params += 'app_key='+'71ca21c41fcd3a2019410a17148ffd72';
    params += '&method='+method;
    params +='&v=1.0'+'&sign='+sign
    params +='&360buy_param_json='+JSON.stringify(businessParam);
    params +='&timestamp='+moment().format('YYYY-MM-DD HH:mm:ss');
    params +='&sign_method='+'md5';
    // console.log(params)
    return params;
}


/**
 * 获取京东联盟订单
 * @param {*} pageIndex 
 * @param {*} pageSize 
 * @param {*} startTime 
 * @param {*} endTime 
 */
async function getJdOrderList(pageIndex,pageSize,startTime,endTime) {
    
    const method = 'jd.union.open.order.row.query';  //京东订单接口方法
    const businessParam = {  //构建业务参数
        orderReq:{
            pageIndex:pageIndex,
            pageSize:pageSize,
            startTime:startTime,
            endTime:endTime,
            type:1
        }
    }
    let sign = getSign(JSON.stringify(businessParam),method) //获取签名
    let url = 'https://api.jd.com/routerjson?'+encodeURI(getQueryString(sign,businessParam,method)) //拼接url
    // console.log(url)
    const response = await axios.get(url)
    // console.log(response)
    const result = JSON.parse(response.data.jd_union_open_order_row_query_responce.queryResult)
    if(result.code ==200){
        // console.log(result)
        return result.data
    }
    
}

/**
 * 获取京东联盟链接
 * @param {*} materialId 
 * @param {*} subUnionId 
 * @param {*} positionId 
 */
async function getJdtranUrl(materialId,subUnionId,positionId) {
    const method = 'jd.union.open.promotion.bysubunionid.get';  //京东专链接接口方法
    const businessParam = {
        promotionCodeReq:{
            subUnionId:subUnionId,
            sceneId:1,
            weChatType:1,
            materialId:materialId,
            positionId:positionId
        }
    }

    let sign = getSign(JSON.stringify(businessParam),method) //获取签名
    let url = 'https://api.jd.com/routerjson?'+encodeURI(getQueryString(sign,businessParam,method)) //拼接url
    const response = await axios.get(url)
    const result = JSON.parse(response.data.jd_union_open_promotion_bysubunionid_get_responce.getResult)
    if(result.code ==200){
        let resultUrl = {
            code:200,
            shortUrl:result.data.shortURL
        }
        let resultJson =  JSON.stringify(resultUrl);
        console.log(resultJson)
        return resultJson
    }
}



/**
 * 导出模块
 */
module.exports = {
    getJdOrderList,
    getJdtranUrl
}