// 商品类文件


const MySQL = require('../../util/mysql.js');

async function getGoodsList(pageNumber) {
    const db = new MySQL();
    const sql_sel = "SELECT * FROM union_goods limit ?,?";
    const pageSize = 10; // 每页显示的记录数
    // const pageNumber = pageNumber+1; // 要查询的页码（从1开始）
    const offset = (pageNumber-1)  * pageSize; // 计算偏移量

    try {

        const res = await db.query(sql_sel,[offset, pageSize])
        console.log(res)
        return res;

    } catch (error) {
       console.error(error);
        
    } finally{
        db.close();
    }
}

getGoodsList(2);