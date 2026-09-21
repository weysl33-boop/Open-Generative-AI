import 'server-only';

import * as billingRepo from '../repositories/billing.js';
import { syncOrderPaymentStatus } from './paymentService.js';

export const RECONCILE_INTERVALS = Object.freeze({
  webhookRetryMs: Math.max(1000, Number(process.env.WEBHOOK_RETRY_INTERVAL_MS) || 30_000),
  paymentSyncMs: Math.max(10_000, Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS) || 5 * 60_000),
  // 用户扫码到回调送达通常几秒内完成，等满宽限期再查单才不会和正常回调抢同一笔履约。
  paymentGraceMs: Math.max(30_000, Number(process.env.PAYMENT_RECONCILE_GRACE_MS) || 3 * 60_000),
  paymentMaxAgeMs: Math.max(60_000, Number(process.env.PAYMENT_RECONCILE_MAX_AGE_MS) || 24 * 60 * 60 * 1000),
});

/** 常驻心跳每秒一轮，对账类工作必须按各自节奏摊薄，不能每轮都打厂商接口。 */
export function cycleDue({ lastRunAt = 0, intervalMs, now }) {
  if (!Number(lastRunAt)) return true;
  return now - Number(lastRunAt) >= Math.max(0, Number(intervalMs) || 0);
}

export async function reconcilePendingPaymentOrders({ limit = 5, now = Date.now() } = {}) {
  const rows = await billingRepo.listOrdersAwaitingPaymentSync({
    limit,
    dueBefore: new Date(now - RECONCILE_INTERVALS.paymentGraceMs).toISOString(),
    sinceAfter: new Date(now - RECONCILE_INTERVALS.paymentMaxAgeMs).toISOString(),
  });
  const results = [];
  for (const row of rows) {
    try {
      // 第二参数留空：对账以系统身份核销，不做归属校验。
      const synced = await syncOrderPaymentStatus(row.id, null);
      results.push({ orderId: row.id, provider: row.provider, status: synced.status || null, error: synced.error || null });
    } catch (error) {
      results.push({ orderId: row.id, provider: row.provider, error: String(error.code || 'RECONCILE_FAILED').slice(0, 120) });
    }
  }
  return { scanned: rows.length, results };
}
