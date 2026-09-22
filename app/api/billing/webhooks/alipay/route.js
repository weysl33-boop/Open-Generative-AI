import { logPaymentEvent } from '@/lib/payments/paymentLog';
import { paymentNotificationOutcome } from '@/lib/payments/provider';
import { resolveAlipayProvider } from '@/lib/payments/providerCredentials';
import { dispatchPaymentWebhook } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';

// 支付宝只按响应体是否为 "success" 判断是否需要重推，因此履约没跑完时绝不能回 success，
// 否则这笔钱的到账通知会被永久确认掉。
function respond(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request) {
  let rawText;
  try {
    rawText = await request.text();
  } catch {
    return respond('failure', 400);
  }
  const params = {};
  for (const [key, value] of new URLSearchParams(rawText).entries()) {
    params[key] = value;
  }

  let result = null;
  let error = null;
  try {
    const alipay = await resolveAlipayProvider();
    logPaymentEvent('payment.alipay.notify.received', {
      provider: 'alipay',
      orderId: params.out_trade_no,
      outTradeNo: params.out_trade_no,
      alipayTradeNo: params.trade_no,
      status: params.trade_status,
    });
    // 验签串会剔除 sign_type，所以算法本身必须单独钉住：RSA 之外的算法一律不认。
    if (String(params.sign_type || '').toUpperCase() !== 'RSA2') {
      throw Object.assign(new Error('支付宝通知签名算法不受支持'), { code: 'WEBHOOK_SIGNATURE_INVALID' });
    }
    const verified = alipay.verifyWebhookSignature(params);
    logPaymentEvent('payment.alipay.signature.valid', {
      provider: 'alipay',
      orderId: verified.out_trade_no,
      outTradeNo: verified.out_trade_no,
      alipayTradeNo: verified.trade_no,
      status: verified.trade_status,
    });
    // 验签只证明「这条通知由支付宝签发」，不证明「签给本商户」。公私钥模式下同一把
    // 平台公钥给所有商户用，缺了 app_id 绑定就能拿别家商户的支付通知给我们订单入账。
    if (!alipay.appId || verified.app_id !== alipay.appId) {
      throw Object.assign(new Error('支付宝通知 app_id 与商户配置不一致'), { code: 'ALIPAY_APP_ID_MISMATCH' });
    }
    if (alipay.sellerId && verified.seller_id && verified.seller_id !== alipay.sellerId) {
      throw Object.assign(new Error('支付宝通知 seller_id 与商户配置不一致'), { code: 'ALIPAY_SELLER_ID_MISMATCH' });
    }
    const outTradeNo = verified.out_trade_no;
    const tradeNo = verified.trade_no;
    const totalMinor = Math.round(Number(verified.total_amount || 0) * 100);
    const refundMinor = Math.round(Number(verified.refund_fee || 0) * 100);

    // 支付宝只对「未退干净的单」发 TRADE_SUCCESS，退款完成改发 TRADE_CLOSED + refund_fee；
    // refund_fee 缺省为 0，因此它是区分退款与到账唯一可靠的信号。
    if (outTradeNo && refundMinor > 0) {
      result = await dispatchPaymentWebhook({
        provider: 'alipay',
        event: {
          id: ['alipay_refund', tradeNo || outTradeNo, verified.out_biz_no].filter(Boolean).join('_'),
          type: verified.trade_status || 'TRADE_REFUND',
          kind: 'refund',
          out_trade_no: outTradeNo,
          trade_no: tradeNo,
          refund_id: verified.out_biz_no || null,
          refund_amount_minor: refundMinor,
          amount_total: totalMinor,
          currency: 'CNY',
          createdAt: verified.gmt_refund || verified.gmt_payment || null,
          raw: verified,
        },
      });
    } else if (outTradeNo && (verified.trade_status === 'TRADE_SUCCESS' || verified.trade_status === 'TRADE_FINISHED')) {
      result = await dispatchPaymentWebhook({
        provider: 'alipay',
        event: {
          id: `alipay_${tradeNo || outTradeNo}`,
          type: verified.trade_status,
          kind: 'payment',
          out_trade_no: outTradeNo,
          trade_no: tradeNo,
          amount_total: totalMinor,
          currency: 'CNY',
          createdAt: verified.gmt_payment || null,
          raw: verified,
        },
      });
    }
  } catch (caught) {
    error = caught;
  }

  const outcome = paymentNotificationOutcome({ error, result });
  if (outcome === 'ack') return respond('success', 200);
  if (outcome === 'reject') {
    if (error?.code === 'WEBHOOK_SIGNATURE_INVALID') {
      logPaymentEvent('payment.alipay.signature.invalid', {
        provider: 'alipay',
        orderId: params.out_trade_no,
        outTradeNo: params.out_trade_no,
        alipayTradeNo: params.trade_no,
        status: 'rejected',
        code: error.code,
      });
    }
    console.error('[webhook/alipay/reject]', { code: String(error?.code || result?.action || 'WEBHOOK_REJECTED') });
    return respond('failure', 400);
  }
  console.error('[webhook/alipay/retry]', {
    code: String(error?.code || (error ? 'WEBHOOK_ERROR' : result?.action || 'WEBHOOK_RETRYABLE')),
  });
  return respond('failure', 500);
}
