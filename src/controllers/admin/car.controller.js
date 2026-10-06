/**
 * 管理后台：车辆管理
 */
const adminModel = require('../../models/admin.model');

async function list(req, res) {
  const { page, pageSize, keyword } = req.query;
  const data = await adminModel.getCarList({ page, pageSize, keyword });
  res.json({ code: 0, data });
}

function validate(car) {
  const required = ['car_name', 'image_url', 'day_price'];
  for (const field of required) {
    if (!car[field]) {
      return `缺少必填字段：${field}`;
    }
  }
  if (Number.isNaN(Number(car.day_price)) || Number(car.day_price) < 0) {
    return '日租金必须为非负数字';
  }
  if (car.promotion_day_price && (Number.isNaN(Number(car.promotion_day_price)) || Number(car.promotion_day_price) < 0)) {
    return '促销价必须为非负数字';
  }
  return null;
}

async function create(req, res) {
  const car = req.body || {};
  const err = validate(car);
  if (err) {
    return res.json({ code: 400, msg: err });
  }
  const id = await adminModel.createCar(car);
  res.json({ code: 0, data: { id } });
}

async function update(req, res) {
  const car = req.body || {};
  const err = validate(car);
  if (err) {
    return res.json({ code: 400, msg: err });
  }
  const affected = await adminModel.updateCar(req.params.id, car);
  if (!affected) {
    return res.json({ code: 404, msg: '车辆不存在' });
  }
  res.json({ code: 0 });
}

async function remove(req, res) {
  const affected = await adminModel.deleteCar(req.params.id);
  if (affected === -1) {
    return res.json({ code: 400, msg: '该车辆存在关联订单，不允许删除' });
  }
  if (!affected) {
    return res.json({ code: 404, msg: '车辆不存在' });
  }
  res.json({ code: 0 });
}

module.exports = { list, create, update, remove };
