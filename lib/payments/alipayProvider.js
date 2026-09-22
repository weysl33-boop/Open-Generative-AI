import crypto from 'node:crypto';
import { assertPaymentProvider, normalizeProviderError } from './provider.js';
import { readKeyOrPath } from './keyMaterial.js';
import { logPaymentEvent } from './paymentLog.js';

/** 二维码有效期与 biz_content.timeout_express 必须同源，否则倒计时会在支付宝收单之前先自己关掉。 */
export const ALIPAY_QR_TTL_MS = 30 * 60 * 1000;
export const ALIPAY_TIMEOUT_EXPRESS = '30m';

function formatPrivateKey(keyText) {
  if (!keyText) return '';
  const trimmed = keyText.trim();
  if (trimmed.includes('PRIVATE KEY')) {
    return trimmed;
  }
  const beginTag = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
  const endTag = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
  return `${beginTag}\n${trimmed}\n${endTag}`;
}

function formatPublicKey(keyText) {
  if (!keyText) return '';
  const trimmed = keyText.trim();
  if (trimmed.includes('BEGIN PUBLIC KEY')) {
    return trimmed;
  }
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

/**
 * 支付宝参数字典排序并拼接为待签名串
 * @param {Object} params
 * @param {boolean} isVerify 是否为回调验签（回调验签时需同时排除 sign 和 sign_type）
 */
export function buildAlipaySignString(params, isVerify = false) {
  const sortedKeys = Object.keys(params).sort();
  const pairs = [];
  for (const key of sortedKeys) {
    const val = params[key];
    if (key === 'sign' || (isVerify && key === 'sign_type') || val === undefined || val === null || val === '') {
      continue;
    }
    pairs.push(`${key}=${typeof val === 'object' ? JSON.stringify(val) : String(val)}`);
  }
  return pairs.join('&');
}

/**
 * 使用商户 RSA2 私钥对内容签名
 */
export function signAlipayParams(params, privateKey) {
  const signString = buildAlipaySignString(params, false);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signString, 'utf8');
  return signer.sign(formatPrivateKey(privateKey), 'base64');
}

/**
 * 校验支付宝回调通知签名 (RSA2)
 */
export function verifyAlipaySignature(params, alipayPublicKey) {
  // 缺公钥一律验签失败：放行等于任何伪造的「支付成功」通知都能给用户加积分。
  if (!alipayPublicKey) return false;
  // base64 里的 '+' 会被 form-urlencoded 解成空格，而 sign 不参与验签串，所以只能在
  // 这里还原：不还原的话，凡是签名含 '+' 的到账通知永远验不过，用户付了钱不入账。
  const sign = String(params.sign || '').replace(/ /g, '+');
  if (!sign) return false;
  const signString = buildAlipaySignString(params, true);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signString, 'utf8');
  return verifier.verify(formatPublicKey(alipayPublicKey), sign, 'base64');
}

const ALIPAY_CREDENTIALS = [
  ['appId', 'ALIPAY_APP_ID'],
  ['privateKey', 'ALIPAY_PRIVATE_KEY(_PATH)'],
  ['publicKey', 'ALIPAY_PUBLIC_KEY(_PATH)'],
];

/** 与微信一致：缺平台公钥时通知一律验不过，渠道必须整体判为不可用。 */
export function alipayCredentialReadiness(values = {}) {
  const missing = ALIPAY_CREDENTIALS.filter(([key]) => !values[key]).map(([, label]) => label);
  return { missing, webhookVerifiable: Boolean(values.publicKey), usable: missing.length === 0 };
}

/**
 * 创建支付宝当面付 Provider
 */
export function getAlipayProvider({
  appId = process.env.ALIPAY_APP_ID,
  privateKey = readKeyOrPath(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH, 'alipayProvider'),
  publicKey = readKeyOrPath(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH, 'alipayProvider'),
  gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  notifyUrl = process.env.ALIPAY_NOTIFY_URL,
  onCall = null,
} = {}) {
  const readiness = alipayCredentialReadiness({ appId, privateKey, publicKey });
  const isConfigured = readiness.missing.length === 0;

  async function call(action, executor) {
    try {
      const result = await executor();
      if (onCall) {
        onCall({ provider: 'alipay', action, status: 200, success: true });
      }
      return result;
    } catch (error) {
      const normalized = normalizeProviderError(error, { provider: 'alipay', action });
      if (onCall) {
        onCall({ provider: 'alipay', action, status: normalized.status, success: false, error: normalized.message });
      }
      throw normalized;
    }
  }

  async function requestAlipayApi(method, bizContent) {
    const timestamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const systemParams = {
      app_id: appId,
      method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp,
      version: '1.0',
      notify_url: notifyUrl || `${process.env.PUBLIC_APP_URL || 'https://www.koyosim.com'}/api/billing/webhooks/alipay`,
      biz_content: JSON.stringify(bizContent),
    };

    systemParams.sign = signAlipayParams(systemParams, privateKey);

    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(systemParams)) {
      formData.set(k, v);
    }

    const res = await fetch(gateway, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: formData.toString(),
    });

    const data = await res.json().catch(() => ({}));
    const responseKey = `${method.replace(/\./g, '_')}_response`;
    const responseBody = data[responseKey];

    if (!responseBody || responseBody.code !== '10000') {
      throw Object.assign(
        new Error(responseBody?.sub_msg || responseBody?.msg || '支付宝请求失败'),
        {
          code: responseBody?.sub_code || responseBody?.code || 'ALIPAY_API_ERROR',
          subMsg: responseBody?.sub_msg,
          // 排障要的是支付宝原话：主码定性质（鉴权/参数/权限），子码定动作（换产品还是补资料）。
          alipayCode: responseBody?.code || null,
          alipaySubCode: responseBody?.sub_code || null,
          alipayMsg: responseBody?.msg || null,
          alipaySubMsg: responseBody?.sub_msg || null,
        }
      );
    }

    return responseBody;
  }

  const provider = {
    mode: isConfigured ? 'live' : 'unconfigured',
    webhookVerifiable: readiness.webhookVerifiable,
    missingCredentials: readiness.missing,
    // app_id 是公开标识、不是密钥；回调侧要用它确认「这笔钱是付给本商户的」。
    appId: appId || null,
    sellerId: process.env.ALIPAY_SELLER_ID || null,

    /**
     * 当面付预下单：alipay.trade.precreate
     */
    async createCheckout({ order, user, plan, successUrl, cancelUrl }) {
      // 二维码只能来自支付宝返回的 qr_code。凭证不齐时回一个假码，等于让用户把钱
      // 交给一笔不存在的交易，还会留下一张用户扫不出、厂商也查不到的 pending 订单。
      if (!isConfigured) {
        logPaymentEvent('payment.alipay.precreate.failed', {
          orderId: order?.id, outTradeNo: order?.id, status: 'failed', code: 'ALIPAY_NOT_CONFIGURED',
        });
        throw Object.assign(new Error('支付宝商户凭证未配置完整，无法获取支付二维码'), {
          code: 'ALIPAY_NOT_CONFIGURED',
          status: 503,
        });
      }

      return call('createCheckout', async () => {
        const totalAmountYuan = ((order.amount_minor || Math.round(plan.monthlyUsd * 100)) / 100).toFixed(2);
        const subject = `KoyoSIM AI 算力套餐 - ${plan.name || '创作者套餐'}`;

        const bizContent = {
          out_trade_no: String(order.id),
          total_amount: totalAmountYuan,
          subject: subject.slice(0, 100),
          timeout_express: ALIPAY_TIMEOUT_EXPRESS,
          passback_params: encodeURIComponent(JSON.stringify({ userId: user.id, planId: plan.id })),
        };

        try {
          const res = await requestAlipayApi('alipay.trade.precreate', bizContent);
          // 支付宝可能回 10000 但字段缺失；把 undefined 编码进二维码会渲染成一张「扫得出、付不了」的图。
          if (!res.qr_code) {
            throw Object.assign(new Error('支付宝未返回二维码内容'), { code: 'ALIPAY_QR_MISSING' });
          }
          const qrCode = String(res.qr_code).trim();
          logPaymentEvent('payment.alipay.precreate.success', {
            orderId: order.id,
            outTradeNo: bizContent.out_trade_no,
            status: 'PENDING',
            code: res.code,
            amountMinor: order.amount_minor,
            currency: order.currency,
          });
          return {
            id: order.id,
            qr_code: qrCode,
            url: qrCode,
            expiresAt: new Date(Date.now() + ALIPAY_QR_TTL_MS).toISOString(),
          };
        } catch (error) {
          logPaymentEvent('payment.alipay.precreate.failed', {
            orderId: order.id,
            outTradeNo: bizContent.out_trade_no,
            status: 'FAILED',
            code: error?.alipayCode || error?.code,
            subCode: error?.alipaySubCode,
            msg: error?.alipayMsg,
            subMsg: error?.alipaySubMsg,
          });
          throw error;
        }
      });
    },

    /**
     * 主动查单：alipay.trade.query
     */
    async retrievePayment(orderId) {
      if (!isConfigured) {
        return { paid: false, status: 'WAIT_BUYER_PAY' };
      }

      return call('retrievePayment', async () => {
        const bizContent = {
          out_trade_no: String(orderId),
        };
        const res = await requestAlipayApi('alipay.trade.query', bizContent);
        const isPaid = res.trade_status === 'TRADE_SUCCESS' || res.trade_status === 'TRADE_FINISHED';
        return {
          orderId: res.out_trade_no,
          transactionId: res.trade_no,
          tradeStatus: res.trade_status,
          paid: isPaid,
          amountTotal: Math.round(Number(res.total_amount || 0) * 100),
          buyerLogonId: res.buyer_logon_id,
          sendPayDate: res.send_pay_date,
        };
      });
    },

    /**
     * 取消/关闭订单：alipay.trade.close
     */
    async cancel(orderId) {
      if (!isConfigured) return { success: true, orderId };
      return call('cancel', async () => {
        return await requestAlipayApi('alipay.trade.close', { out_trade_no: String(orderId) });
      });
    },

    /**
     * 申请退款：alipay.trade.refund
     */
    async refund({ outTradeNo, refundAmountYuan, reason = '正常退款', outRequestNo = null }) {
      if (!isConfigured) return { success: true, mock: true };
      const refundNo = outRequestNo || `ref_${outTradeNo}`;
      return call('refund', async () => {
        return await requestAlipayApi('alipay.trade.refund', {
          out_trade_no: String(outTradeNo),
          // out_request_no 既是支付宝侧的退款幂等号（重放不会退两次），也是本地账本引用的退款编号。
          out_request_no: refundNo,
          refund_amount: String(refundAmountYuan),
          refund_reason: reason,
        });
      });
    },

    /**
     * 验证支付宝异步通知签名
     */
    verifyWebhookSignature(params) {
      const isValid = verifyAlipaySignature(params, publicKey);
      if (!isValid) {
        throw Object.assign(new Error('支付宝异步通知验签失败'), { code: 'WEBHOOK_SIGNATURE_INVALID' });
      }
      return params;
    },
  };

  return assertPaymentProvider(provider);
}
