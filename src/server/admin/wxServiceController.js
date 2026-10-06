/**
 * 
 * 处理微信的服务端接口，封装请求
 */


const wx = require('../base/weixin.api.js');



function getUnlimitedQRCode(query, res) {
    const scene = query.scene
    const page = query.page
    console.log(scene,page)
    wx.getUnlimitedQRCode(scene, page).then((response) => {
        // 设置正确的Content-Type
        res.setHeader('Content-Type', 'image/png');
        res.end(response.data,'binary')
        // const base64Image = Buffer.from(response.data, 'binary').toString('base64');
        // const imageSrc = `data:image/png;base64,${base64Image}`;
        // res.end(`<img src="${imageSrc}" alt="QR Code" />`)
    })
}



module.exports = {
    getUnlimitedQRCode
}