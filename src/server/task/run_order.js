// 获取联盟订单落库

const unionJd = require('../base/union_jd.js');

let runJd = async()=>{
    try {
        const res = await unionJd.getJdOrderList(1,10,"2025-05-02 01:30:30","2025-05-02 01:40:30")
        for (let i = 0; i < res.length; i++) {
            // 遍历数组，对每个元素进行操作
            console.log(res[i].orderId);
            console.log(res[i].skuName);
            console.log(res[i].skuId);
            console.log(res[i].orderTime);
            console.log(res[i].commissionRate);
            console.log(res[i].subUnionId);
            console.log(res[i].finalRate);
        }

    } catch (error) {
        console.error("Error in runJd:", error);  // 更详细的错误日志
    }
    
} 


function getOrderbyTime(){
    let interval = setInterval(() => {
        runJd().catch(err => console.error("Interval error:", err))
    }, 5000); //秒触发一次
}
getOrderbyTime()


