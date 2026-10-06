/**
 * 汽车相关controller逻辑处理
 */
const car = require('../models/car.model');

/**
 * 车辆分页列表
 */
async function getCarList(req, res) {
  const { pageNum } = req.query;
  if (!pageNum) {
    return res.status(400).send('参数错误');
  }
  const data = await car.getCarList(pageNum);
  const result = { code: 0, list: data };
  res.json(result);
}

module.exports = {
  getCarList,
};
