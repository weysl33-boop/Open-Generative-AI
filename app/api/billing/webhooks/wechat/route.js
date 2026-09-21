import { NextResponse } from 'next/server';
import { paymentNotificationOutcome } from '@/lib/payments/provider';
import { resolveWechatProvider } from '@/lib/payments/providerCredentials';
import { dispatchPaymentWebhook } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';

export async function POST(request) {
  let rawBody;
  let headers;
  try {
    rawBody = await request.text();
    headers = {
      'wechatpay-signature': request.headers.get('wechatpay-signature') || '',
      'wechatpay-timestamp': request.headers.get('wechatpay-timestamp') || '',
      'wechatpay-nonce': request.headers.get('wechatpay-nonce') || '',
      'wechatpay-serial': request.headers.get('wechatpay-serial') || '',
    };
  } catch {
    return NextResponse.json({ code: 'FAIL', message: '无法读取通知报文' }, { status: 400 });
  }

  let result = null;
  let error = null;
  try {
    const wechat = await resolveWechatProvider();
    const notification = wechat.verifyWebhookSignature(rawBody, headers);
    const outTradeNo = notification.out_trade_no;
    const transactionId = notification.transaction_id;
    const isRefund = String(notification.event_type || '').startsWith('REFUND');

    if (outTradeNo && isRefund && notification.refund_status === 'SUCCESS') {
      result = await dispatchPaymentWebhook({
        provider: 'wechat',
        headers,
        event: {
          id: `wx_refund_${notification.refund_id || notification.out_refund_no || transactionId || outTradeNo}`,
          type: notification.event_type,
          kind: 'refund',
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          refund_id: notification.refund_id || null,
          out_refund_no: notification.out_refund_no || null,
          refund_amount_minor: notification.amount?.refund,
          amount_total: notification.amount?.total,
          currency: notification.amount?.currency || 'CNY',
          createdAt: notification.success_time || null,
          raw: notification,
        },
      });
    } else if (outTradeNo && !isRefund && notification.trade_state === 'SUCCESS') {
      result = await dispatchPaymentWebhook({
        provider: 'wechat',
        headers,
        event: {
          id: `wx_${transactionId || outTradeNo}`,
          type: notification.event_type || 'TRANSACTION.SUCCESS',
          kind: 'payment',
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          amount_total: notification.amount?.total,
          currency: 'CNY',
          createdAt: notification.success_time || null,
          raw: notification,
        },
      });
    }
  } catch (caught) {
    error = caught;
  }

  const outcome = paymentNotificationOutcome({ error, result });
  if (outcome === 'ack') return NextResponse.json({ code: 'SUCCESS', message: '成功' }, { status: 200 });
  if (outcome === 'reject') {
    console.error('[webhook/wechat/reject]', { code: String(error?.code || result?.action || 'WEBHOOK_REJECTED') });
    return NextResponse.json({ code: 'FAIL', message: '通知未通过校验' }, { status: 400 });
  }
  console.error('[webhook/wechat/retry]', {
    code: String(error?.code || (error ? 'WEBHOOK_ERROR' : result?.action || 'WEBHOOK_RETRYABLE')),
  });
  return NextResponse.json({ code: 'FAIL', message: '订单履约未完成，等待重试' }, { status: 500 });
}
