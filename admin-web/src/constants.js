/** 订单支付状态 */
export const PAY_STATUS = {
  0: { text: '待支付', type: 'info' },
  1: { text: '已支付', type: 'success' },
  2: { text: '已退款', type: 'warning' },
  3: { text: '支付失败', type: 'danger' },
};

/** 订单履约状态 */
export const ORDER_STATUS = {
  0: { text: '待取车', type: 'info' },
  1: { text: '已取车', type: 'primary' },
  2: { text: '已还车', type: 'warning' },
  3: { text: '已完成', type: 'success' },
  4: { text: '已取消', type: 'danger' },
};

export function payStatusText(v) {
  return (PAY_STATUS[v] || {}).text || v;
}

export function orderStatusText(v) {
  return (ORDER_STATUS[v] || {}).text || v;
}

export function orderStatusType(v) {
  return (ORDER_STATUS[v] || {}).type || 'info';
}

export function payStatusType(v) {
  return (PAY_STATUS[v] || {}).type || 'info';
}

/** 用户授权业务名 */
export const BIZ_NAMES = {
  pp: '租车小程序',
};
