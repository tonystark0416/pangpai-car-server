// 用户登录登出路由文件
// 处理路由文件，按照请求接口路径进行路由分配，此模块不关心数据的结构和内容

// 引入此路由获取数据的方法
const {loginHand,loginOutHand} = require('../controller/user.js');

//引入返回格式
const {DataModel,SuccessModel,ErrorModel} =  require('../model/dataModel.js');

//处理路由的逻辑
const handleUserRouter = (req,res)=>{

    // 获取接口请求方式
    const method = req.method;

    //用户登陆接口
    if (method === 'POST' && req.url ==='api/test/user/login') {
        const {username,password} = req.body;
        const data = loginHand(username,password);
        if (data.code===0) {
            return new SuccessModel(data);
        }else{
            return new ErrorModel('登陆失败');
        }
    }

    // 用户登出接口
    if(method === 'GET' && req.path ==='/api/test/user/logout'){
        const data = loginOutHand()
        if(data.code === 0){
            return new DataModel(data)
        }else{
            return new ErrorModel('登出失败')
        }
    }

}

module.exports = handleUserRouter;
