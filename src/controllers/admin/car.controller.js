/**
 * 管理后台：车辆管理
 */
const adminModel = require('../../models/admin.model');

async function list(req, res) {
  const { page, pageSize, keyword, status } = req.query;
  const data = await adminModel.getCarList({ page, pageSize, keyword, status });
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
  if (car.status !== undefined && car.status !== null && car.status !== '') {
    if (![0, 1, '0', '1'].includes(car.status)) {
      return '上下架状态只能为 1（上架）或 0（下架）';
    }
  }
  if (car.sort !== undefined && car.sort !== null && car.sort !== '') {
    const sort = Number(car.sort);
    if (!Number.isInteger(sort) || sort < 1 || sort > 10000) {
      return '排序值必须为 1~10000 之间的整数';
    }
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

/** 上下架切换：body { status: 1|0 } */
async function updateStatus(req, res) {
  const { status } = req.body || {};
  if (![0, 1, '0', '1'].includes(status)) {
    return res.json({ code: 400, msg: '上下架状态只能为 1（上架）或 0（下架）' });
  }
  const affected = await adminModel.updateCarStatus(req.params.id, status);
  if (!affected) {
    return res.json({ code: 404, msg: '车辆不存在' });
  }
  res.json({ code: 0, msg: Number(status) === 1 ? '已上架' : '已下架' });
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

module.exports = { list, create, update, updateStatus, remove };
