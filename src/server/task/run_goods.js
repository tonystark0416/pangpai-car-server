// Created on iPad.

const vip = require('../base/union_vip.js');
const MySQL = require('../../util/mysql.js');

//搜索vip商品，保存到数据库
async function searchVipGoods(channelType,chanTag,pageSize,offset) {

    const db =  new MySQL();
    const sql_ins = "INSERT INTO union_goods (goods_name,goods_img,goods_url,goods_price,platform,goods_platform_id) values (?,?,?,?,?,?)";
    const sql_sel = "SELECT goods_platform_id FROM union_goods where goods_platform_id = ?";
    const sql_update = "UPDATE union_goods SET goods_name=?,goods_img=? ,goods_url=? ,goods_price=?  WHERE goods_platform_id=?";
    await db.connect();

    try {
        const vip_res = await vip.getGoodsList(channelType,chanTag,pageSize,offset) //请求唯品会接口
        const arr = vip_res.result.goodsInfoList //解释数据
        
        //循环插入
        for (let index = 0; index < arr.length; index++) {
            const is_exist = await db.query(sql_sel,[arr[index].goodsId]) //查询是否存在，入参第三方平台商品id
            
            if (is_exist[0]) {
                console.log('商品已存在，需要更新数据')
                let update_params = [arr[index].goodsName,arr[index].goodsThumbUrl,arr[index].destUrl,arr[index].vipPrice,arr[index].goodsId]
                const update_res = await db.query(sql_update,update_params)
                console.log(JSON.stringify(update_res))
                console.log('更新完成')
            }else{
                console.log('开始插入数据')
                let params = [arr[index].goodsName, arr[index].goodsThumbUrl, arr[index].destUrl, arr[index].vipPrice, 'vip', arr[index].goodsId]
                const results = await db.query(sql_ins, params)
                console.log(JSON.stringify(results))
                console.log('插入完成')
            }
            

        }
    } catch (err) {
        console.error(err)
    } finally{
        db.close();
    }
}

searchVipGoods(1,'123213',10,1)