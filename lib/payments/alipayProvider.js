import crypto from 'node:crypto';
import fs from 'node:fs';
import { assertPaymentProvider, normalizeProviderError } from './provider.js';

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
  const sign = params.sign;
  if (!sign) return false;
  const signString = buildAlipaySignString(params, true);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signString, 'utf8');
  return verifier.verify(formatPublicKey(alipayPublicKey), sign, 'base64');
}

function readKeyOrPath(val, pathVal) {
  if (val && String(val).trim()) return String(val).trim();
  if (pathVal && String(pathVal).trim()) {
    const trimmedPath = String(pathVal).trim();
    try {
      if (fs.existsSync(trimmedPath)) return fs.readFileSync(trimmedPath, 'utf8');
    } catch (e) {
      console.warn('[alipayProvider] 读取公钥/私钥文件失败:', trimmedPath, e.message);
    }
  }
  return null;
}

/**
 * 创建支付宝当面付 Provider
 */
export function getAlipayProvider({
  appId = process.env.ALIPAY_APP_ID,
  privateKey = readKeyOrPath(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH),
  publicKey = readKeyOrPath(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH),
  gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  notifyUrl = process.env.ALIPAY_NOTIFY_URL,
  onCall = null,
} = {}) {
  const isConfigured = Boolean(appId && privateKey && publicKey);

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
      notify_url: notifyUrl || `${process.env.PUBLIC_APP_URL || 'https://go.koyosim.com'}/api/billing/webhooks/alipay`,
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
        }
      );
    }

    return responseBody;
  }

  const provider = {
    mode: isConfigured ? 'live' : 'unconfigured',

    /**
     * 当面付预下单：alipay.trade.precreate
     */
    async createCheckout({ order, user, plan, successUrl, cancelUrl }) {
      if (!isConfigured) {
        const mockQr = `https://qr.alipay.com/mock_order_${order.id}`;
        return {
          id: `alipay_mock_${order.id}`,
          url: mockQr,
          qr_code: mockQr,
          isMock: true,
        };
      }

      return call('createCheckout', async () => {
        const totalAmountYuan = ((order.amount_minor || Math.round(plan.monthlyUsd * 100)) / 100).toFixed(2);
        const subject = `KoyoSIM AI 算力套餐 - ${plan.name || '创作者套餐'}`;

        const bizContent = {
          out_trade_no: String(order.id),
          total_amount: totalAmountYuan,
          subject: subject.slice(0, 100),
          timeout_express: '30m',
          passback_params: encodeURIComponent(JSON.stringify({ userId: user.id, planId: plan.id })),
        };

        const res = await requestAlipayApi('alipay.trade.precreate', bizContent);
        return {
          id: order.id,
          qr_code: res.qr_code,
          url: res.qr_code,
        };
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
    async refund({ outTradeNo, refundAmountYuan, reason = '正常退款' }) {
      if (!isConfigured) return { success: true, mock: true };
      return call('refund', async () => {
        return await requestAlipayApi('alipay.trade.refund', {
          out_trade_no: String(outTradeNo),
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
        throw new Error('支付宝异步通知验签失败');
      }
      return params;
    },
  };

  return assertPaymentProvider(provider);
}
