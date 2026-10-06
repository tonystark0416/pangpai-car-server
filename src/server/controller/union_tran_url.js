/* 
获取链接接口，聚合所有平台的转链接接口
*/
const jd = require('../base/union_jd.js');
const vip = require('../base/union_vip.js');

// jd.getJdtranUrl('https://u.jd.com/gDJkOB2','rrz002',3004176369)

/**
 * 转链接API方法
 * @param {*} platForm 
 * @param {*} url 
 * @param {*} uid 
 * @param {*} pid 
 */
const union_tran_url = (query, res) => {

    const platForm = query.platForm
    const goodsId = query.goodsId
    const uid = query.uid
    const pid = query.pid

    switch (platForm) {
        case 'jd':
            jd.getJdtranUrl(goodsId, uid, pid).then((data) => {
                res.end(data)
            })
            break;
        case 'vip':
            vip.getVipUrl(goodsId, uid, pid).then((data) => {
                res.end(data)
            })
            break;
        default:
            res.end('no platForm!')
            break;
    }

}


const search = (query, res) => {
    const channelType = query.channelType
    const chanTag = query.chanTag
    const pageSize = query.pageSize
    const offset = query.offset
    vip.getGoodsList(channelType, chanTag, pageSize, offset).then((data) => {
        console.log(data)
        res.end(JSON.stringify(data))
    })
}

/**
 * 导出模块
 */ 
module.exports = {
    union_tran_url,
    search
}