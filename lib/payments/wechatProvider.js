import crypto from 'node:crypto';
import { assertPaymentProvider, normalizeProviderError } from './provider.js';
import { readKeyOrPath } from './keyMaterial.js';

function randomNonce(length = 32) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

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
  if (trimmed.includes('BEGIN CERTIFICATE') || trimmed.includes('BEGIN PUBLIC KEY')) {
    return trimmed;
  }
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

/**
 * 构建微信支付 V3 请求头 Authorization
 */
export function buildWechatV3AuthHeader({
  method,
  urlPath,
  timestamp,
  nonce,
  body = '',
  mchId,
  serialNo,
  privateKey,
}) {
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message, 'utf8');
  const signature = sign.sign(formatPrivateKey(privateKey), 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

/**
 * 微信支付 V3 回调通知 AEAD_AES_256_GCM 密文解密
 */
export function decryptWechatV3Resource(resource, apiV3Key) {
  if (!resource || !resource.ciphertext || !resource.nonce) {
    throw new Error('微信回调 resource 格式不合法');
  }
  if (!apiV3Key || apiV3Key.length !== 32) {
    throw new Error('WECHAT_API_V3_KEY 必须为 32 字节有效密钥');
  }

  const ciphertextBuffer = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
  const dataBuffer = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8')
  );
  decipher.setAuthTag(authTag);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }

  const decrypted = Buffer.concat([decipher.update(dataBuffer), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * 验证微信支付回调签名 (RSA-SHA256)
 */
export function verifyWechatV3Signature({
  timestamp,
  nonce,
  body,
  signature,
  wechatPublicKey,
}) {
  // 与支付宝同理：无平台公钥时不能返回「验签通过」，否则回调可被任意伪造。
  if (!wechatPublicKey) {
    return false;
  }
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(message, 'utf8');
  return verify.verify(formatPublicKey(wechatPublicKey), signature, 'base64');
}

const WECHAT_ORDER_CREDENTIALS = [
  ['appId', 'WECHAT_APP_ID'],
  ['mchId', 'WECHAT_MCH_ID'],
  ['apiV3Key', 'WECHAT_API_V3_KEY'],
  ['serialNo', 'WECHAT_CERT_SERIAL_NO'],
  ['privateKey', 'WECHAT_PRIVATE_KEY(_PATH)'],
];

/**
 * 渠道可用性判定：下单凭证缺一就不能真实扣款，平台公钥缺失更阴——它能扣款却收下
 * 所有被 fail-closed 拒掉的到账通知，钱进了商户账户而订单永远停在未支付。
 */
export function wechatCredentialReadiness(values = {}) {
  const missing = WECHAT_ORDER_CREDENTIALS.filter(([key]) => !values[key]).map(([, label]) => label);
  const webhookVerifiable = Boolean(values.publicKey);
  return { missing, webhookVerifiable, usable: missing.length === 0 && webhookVerifiable };
}

/**
 * 创建微信支付 Provider
 */
export function getWechatProvider({
  appId = process.env.WECHAT_APP_ID,
  mchId = process.env.WECHAT_MCH_ID,
  apiV3Key = process.env.WECHAT_API_V3_KEY,
  serialNo = process.env.WECHAT_CERT_SERIAL_NO || process.env.WECHAT_SERIAL_NO,
  privateKey = readKeyOrPath(process.env.WECHAT_PRIVATE_KEY, process.env.WECHAT_PRIVATE_KEY_PATH, 'wechatProvider'),
  publicKey = readKeyOrPath(process.env.WECHAT_PUBLIC_KEY, process.env.WECHAT_CERT_PATH, 'wechatProvider'),
  notifyUrl = process.env.WECHAT_NOTIFY_URL,
  onCall = null,
} = {}) {
  const readiness = wechatCredentialReadiness({ appId, mchId, apiV3Key, serialNo, privateKey, publicKey });
  const missingKeys = readiness.missing;
  const isConfigured = missingKeys.length === 0;
  if (!isConfigured) {
    console.warn('[wechatProvider] 微信支付未完成全部商户参数配置，当前运行在 Mock 模式，缺失项:', missingKeys.join(', '));
  }

  async function call(action, executor) {
    try {
      const result = await executor();
      if (onCall) {
        onCall({ provider: 'wechat', action, status: 200, success: true });
      }
      return result;
    } catch (error) {
      const normalized = normalizeProviderError(error, { provider: 'wechat', action });
      if (onCall) {
        onCall({ provider: 'wechat', action, status: normalized.status, success: false, error: normalized.message });
      }
      throw normalized;
    }
  }

  const provider = {
    mode: isConfigured ? 'live' : 'unconfigured',
    webhookVerifiable: readiness.webhookVerifiable,
    missingCredentials: missingKeys,

    /**
     * Native 扫码统一下单
     */
    async createCheckout({ order, user, plan, successUrl, cancelUrl }) {
      if (!isConfigured) {
        const mockQr = `weixin://wxpay/bizpayurl?pr=mock_order_${order.id}`;
        return {
          id: `wx_mock_${order.id}`,
          url: mockQr,
          code_url: mockQr,
          isMock: true,
        };
      }

      return call('createCheckout', async () => {
        const urlPath = '/v3/pay/transactions/native';
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomNonce();
        const description = `KoyoSIM AI 算力套餐 - ${plan.name || '创作者套餐'}`;
        const amountTotal = Math.max(1, Math.round(order.amount_minor || (plan.monthlyUsd * 100)));

        const payload = {
          appid: appId,
          mchid: mchId,
          description: description.slice(0, 120),
          out_trade_no: String(order.id),
          notify_url: notifyUrl || `${process.env.PUBLIC_APP_URL || 'https://www.koyosim.com'}/api/billing/webhooks/wechat`,
          amount: {
            total: amountTotal,
            currency: 'CNY',
          },
          attach: JSON.stringify({ userId: user.id, planId: plan.id, orderId: order.id }),
        };

        const bodyString = JSON.stringify(payload);
        const authHeader = buildWechatV3AuthHeader({
          method: 'POST',
          urlPath,
          timestamp,
          nonce,
          body: bodyString,
          mchId,
          serialNo,
          privateKey,
        });

        const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: authHeader,
          },
          body: bodyString,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.code_url) {
          throw Object.assign(new Error(data.message || data.detail || '微信统一下单失败'), {
            statusCode: res.status,
            code: data.code || 'WECHAT_NATIVE_FAILED',
          });
        }

        return {
          id: order.id,
          code_url: data.code_url,
          url: data.code_url,
        };
      });
    },

    /**
     * 主动查询订单支付状态
     */
    async retrievePayment(orderId) {
      if (!isConfigured) {
        return { paid: false, status: 'NOTPAY' };
      }

      return call('retrievePayment', async () => {
        const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(mchId)}`;
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomNonce();

        const authHeader = buildWechatV3AuthHeader({
          method: 'GET',
          urlPath,
          timestamp,
          nonce,
          body: '',
          mchId,
          serialNo,
          privateKey,
        });

        const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: authHeader,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw Object.assign(new Error(data.message || '微信查单失败'), { statusCode: res.status });
        }

        const isPaid = data.trade_state === 'SUCCESS';
        return {
          orderId: data.out_trade_no,
          transactionId: data.transaction_id,
          tradeState: data.trade_state,
          paid: isPaid,
          amountTotal: data.amount?.total,
          payer: data.payer,
          successTime: data.success_time,
        };
      });
    },

    /**
     * 取消订单
     */
    async cancel(orderId) {
      return { success: true, orderId };
    },

    /**
     * 申请退款
     */
    async refund({ paymentIntentId, outTradeNo, refundAmount, totalAmount, reason = '协商退款', outRefundNo = null }) {
      if (!isConfigured) return { success: true, mock: true };
      return call('refund', async () => {
        const urlPath = '/v3/refund/domestic/refunds';
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomNonce();
        // 退款单号按订单固定：管理员重试同一笔退款时微信会按 out_refund_no 幂等去重，
        // 用时间戳生成会让一次重放变成两笔真实退款。
        const refundNo = outRefundNo || `ref_${outTradeNo}`;

        const payload = {
          out_trade_no: outTradeNo,
          out_refund_no: refundNo,
          reason,
          amount: {
            refund: refundAmount,
            total: totalAmount,
            currency: 'CNY',
          },
        };

        const bodyString = JSON.stringify(payload);
        const authHeader = buildWechatV3AuthHeader({
          method: 'POST',
          urlPath,
          timestamp,
          nonce,
          body: bodyString,
          mchId,
          serialNo,
          privateKey,
        });

        const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: authHeader,
          },
          body: bodyString,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw Object.assign(new Error(data.message || '微信申请退款失败'), { statusCode: res.status });
        }
        return data;
      });
    },

    /**
     * 校验微信 Webhook 签名并解密内容
     */
    verifyWebhookSignature(rawBody, headers) {
      const signature = headers['wechatpay-signature'];
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];

      if (!signature || !timestamp || !nonce) {
        throw Object.assign(new Error('微信通知缺少必要签名头部'), { code: 'WEBHOOK_HEADERS_MISSING' });
      }

      const isValid = verifyWechatV3Signature({
        timestamp,
        nonce,
        body: typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
        signature,
        wechatPublicKey: publicKey,
      });

      if (!isValid) {
        throw Object.assign(new Error('微信支付签名验证失败'), { code: 'WEBHOOK_SIGNATURE_INVALID' });
      }

      const bodyObj = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
      // 所有通知的 resource 都是同一套密文，只解 TRANSACTION.SUCCESS 会让真实退款被当成
      // 无关事件丢弃：钱退了，本地订单与额度却永远不会回冲。
      const payload = bodyObj.resource ? decryptWechatV3Resource(bodyObj.resource, apiV3Key) : bodyObj;
      return { ...payload, event_type: bodyObj.event_type || null, notification_id: bodyObj.id || null };
    },
  };

  return assertPaymentProvider(provider);
}
