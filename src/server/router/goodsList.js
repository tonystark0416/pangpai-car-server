// 获取商品的路由
// 处理路由文件，按照请求接口路径进行路由分配，此模块不关心数据的结构和内容

// 引入此路由获取数据的方法
const {getProductList} = require('../controller/vipshop.js');
//引入返回格式
const {DataModel,SuccessModel,ErrorModel} =  require('../model/dataModel.js');


const handelGoodsListRouter = (req,res)=>{
    const myURL = new URL(req.url,`http://${req.headers.host}`)
    // console.log(myURL.pathname)
    if (req.method === 'GET') {
        const params = myURL.searchParams
        const channelType = params.get('channelType')
        const chanTag = params.get('chanTag')
        const openId = params.get('openId')
        const offset = params.get('offset')
        console.log('请求参数:'+channelType,chanTag,openId,offset);
        
        return getProductList(channelType,chanTag,openId,offset)
        .then(data=>{
            return data;
        })
        .catch(err=>{
            console.log('错误:',err)
        })

    }else{
        return new ErrorModel('查询商品失败');
    }
}

module.exports = handelGoodsListRouter;