/**
 * 支付链路结构化日志。
 *
 * 只接受白名单标量字段：调用方必须先把 params/credentials 摘干净，
 * 这里不做脱敏兜底，因为「顺手把 raw 传进来」正是私钥进日志的唯一路径。
 */
const ALLOWED_FIELDS = [
  'orderId',
  'outTradeNo',
  'alipayTradeNo',
  'status',
  'provider',
  'productType',
  'amountMinor',
  'currency',
  'creditAmount',
  'planId',
  'code',
  'subCode',
  'msg',
  'subMsg',
  'expiresAt',
  'eventId',
  'userId',
];

export function logPaymentEvent(event, fields = {}) {
  const entry = { event, ts: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') continue;
    entry[key] = typeof value === 'object' ? String(value) : value;
  }
  console.info(JSON.stringify(entry));
}
