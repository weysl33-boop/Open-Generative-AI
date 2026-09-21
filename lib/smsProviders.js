import 'server-only';

import crypto from 'node:crypto';
import { getFirebaseWebConfig, getSmsConfiguration, getSmsProviderCredentials } from './smsConfig.js';

export class SmsProvider {
  constructor(id) {
    this.id = id;
  }

  async sendOtp() {
    throw Object.assign(new Error('SMS provider sendOtp is not implemented'), { code: 'PROVIDER_NOT_IMPLEMENTED' });
  }

  async verifyOtp() {
    throw Object.assign(new Error('SMS provider verifyOtp is not implemented'), { code: 'PROVIDER_NOT_IMPLEMENTED' });
  }

  async healthCheck() {
    return { status: 'unavailable', errorCode: 'HEALTH_CHECK_NOT_IMPLEMENTED' };
  }
}

function providerError(provider, error) {
  const raw = String(error?.code || error?.Code || error?.name || 'PROVIDER_ERROR');
  const code = raw.toLowerCase();
  if (/unauthor|invalid.?credential|invalid.?key|secret.?id|access.?key|forbidden|http_401|http_403/.test(code)) {
    return Object.assign(new Error('SMS provider credentials were rejected'), {
      code: 'PROVIDER_UNAUTHORIZED', provider, retryable: false,
    });
  }
  if (/quota|limitexceeded|rate.?limit|throttl|insufficient.?balance/.test(code)) {
    return Object.assign(new Error('SMS provider quota or rate limit exceeded'), {
      code: 'PROVIDER_QUOTA_EXCEEDED', provider, retryable: false,
    });
  }
  if (/template|sign|invalidparameter|missingparameter|invalid.?phone/.test(code)) {
    return Object.assign(new Error('SMS provider rejected the configured request'), {
      code: 'PROVIDER_REQUEST_REJECTED', provider, retryable: false,
    });
  }
  if (/timeout|network|econn|unavailable|internalerror|failedoperation|servererror|^5\d\d/.test(code)) {
    return Object.assign(new Error('SMS provider is temporarily unavailable'), {
      code: 'PROVIDER_UNAVAILABLE', provider, retryable: true,
    });
  }
  return Object.assign(new Error('SMS provider returned an unsuccessful result'), {
    code: 'PROVIDER_SERVICE_ERROR', provider, retryable: true,
  });
}

function requireCredentials(provider, credentials, names) {
  if (names.some((name) => !credentials[name])) {
    throw Object.assign(new Error('SMS provider credentials are not configured'), {
      code: 'SMS_PROVIDER_NOT_CONFIGURED', provider, retryable: false,
    });
  }
}

async function getTencentClient(provider, service, version) {
  const credentials = await getSmsProviderCredentials(provider);
  requireCredentials(provider, credentials, ['secret_id', 'secret_key']);
  const [serviceImport, commonModule] = await Promise.all([
    service === 'tencentcloud-sdk-nodejs-sms'
      ? import('tencentcloud-sdk-nodejs-sms')
      : import('tencentcloud-sdk-nodejs-captcha'),
    import('tencentcloud-sdk-nodejs-common'),
  ]);
  const common = commonModule.default || commonModule;
  const cloud = serviceImport.default || serviceImport;
  const serviceModule = cloud.default || cloud;
  const Client = serviceModule[service.split('-').at(-1)]?.[version]?.Client
    || serviceModule.sms?.[version]?.Client
    || serviceModule.captcha?.[version]?.Client;
  if (typeof Client !== 'function') {
    throw Object.assign(new Error('SMS provider SDK is unavailable'), { code: 'PROVIDER_SDK_UNAVAILABLE', provider, retryable: false });
  }
  return new Client({
    credential: new common.BasicCredential(credentials.secret_id, credentials.secret_key),
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: provider === 'tencent_captcha' ? 'captcha.tencentcloudapi.com' : 'sms.tencentcloudapi.com',
        reqTimeout: 10,
      },
    },
  });
}

export class TencentSmsProvider extends SmsProvider {
  constructor() {
    super('tencent_sms');
  }

  async sendOtp({ phone, code }) {
    const config = await getSmsConfiguration();
    const settings = config.providers.tencent_sms;
    const credentials = await getSmsProviderCredentials(this.id);
    requireCredentials(this.id, credentials, ['secret_id', 'secret_key']);
    if (!settings.sdkAppId || !settings.signName || !settings.templateId) {
      throw Object.assign(new Error('Tencent SMS app, sign, or template is not configured'), {
        code: 'SMS_PROVIDER_NOT_CONFIGURED', provider: this.id, retryable: false,
      });
    }

    try {
      const client = await getTencentClient(this.id, 'tencentcloud-sdk-nodejs-sms', 'v20210111');
      const result = await client.SendSms({
        PhoneNumberSet: [phone.e164],
        SmsSdkAppId: settings.sdkAppId,
        SignName: settings.signName,
        TemplateId: settings.templateId,
        TemplateParamSet: [code],
      });
      const status = result?.SendStatusSet?.[0];
      if (!status || status.Code !== 'Ok') {
        throw Object.assign(new Error('Tencent SMS send failed'), { code: status?.Code || 'PROVIDER_SERVICE_ERROR' });
      }
      return { providerSession: null };
    } catch (error) {
      if (['SMS_PROVIDER_NOT_CONFIGURED', 'PROVIDER_SDK_UNAVAILABLE'].includes(error.code)) throw error;
      throw providerError(this.id, error);
    }
  }

  async verifyOtp({ expectedHash, submittedHash, compare }) {
    return compare(expectedHash, submittedHash);
  }

  async healthCheck() {
    const config = await getSmsConfiguration();
    const credentials = await getSmsProviderCredentials(this.id);
    try {
      requireCredentials(this.id, credentials, ['secret_id', 'secret_key']);
      if (!config.providers.tencent_sms.sdkAppId) return { status: 'unavailable', errorCode: 'SMS_PROVIDER_NOT_CONFIGURED' };
      const client = await getTencentClient(this.id, 'tencentcloud-sdk-nodejs-sms', 'v20210111');
      await client.DescribeSmsSignList({ International: 0, Limit: 1, Offset: 0 });
      return { status: 'healthy', errorCode: null };
    } catch (error) {
      return {
        status: error.code === 'SMS_PROVIDER_NOT_CONFIGURED' ? 'unavailable' : 'degraded',
        errorCode: error.code || 'PROVIDER_HEALTH_CHECK_FAILED',
      };
    }
  }
}

function createAliyunClient(credentials) {
  return import('@alicloud/dysmsapi20170525').then(async (smsModule) => {
    const openApiModule = await import('@alicloud/openapi-client');
    const OpenApi = openApiModule.default || openApiModule;
    const Client = smsModule.default || smsModule;
    const config = new OpenApi.Config({
      accessKeyId: credentials.access_key_id,
      accessKeySecret: credentials.access_key_secret,
      endpoint: 'dysmsapi.aliyuncs.com',
      readTimeout: 8000,
      connectTimeout: 3000,
    });
    return { client: new Client(config), smsModule };
  });
}

export class AliyunSmsProvider extends SmsProvider {
  constructor() {
    super('aliyun_sms');
  }

  async sendOtp({ phone, code }) {
    const config = await getSmsConfiguration();
    const settings = config.providers.aliyun_sms;
    const credentials = await getSmsProviderCredentials(this.id);
    requireCredentials(this.id, credentials, ['access_key_id', 'access_key_secret']);
    if (!settings.signName || !settings.templateId) {
      throw Object.assign(new Error('Aliyun SMS sign or template is not configured'), {
        code: 'SMS_PROVIDER_NOT_CONFIGURED', provider: this.id, retryable: false,
      });
    }

    try {
      const { client, smsModule } = await createAliyunClient(credentials);
      const request = new smsModule.SendSmsRequest({
        phoneNumbers: phone.nationalNumber,
        signName: settings.signName,
        templateCode: settings.templateId,
        templateParam: JSON.stringify({ code }),
      });
      const result = await client.sendSms(request);
      if (result?.body?.code !== 'OK') {
        throw Object.assign(new Error('Aliyun SMS send failed'), { code: result?.body?.code || 'PROVIDER_SERVICE_ERROR' });
      }
      return { providerSession: null };
    } catch (error) {
      if (error.code === 'SMS_PROVIDER_NOT_CONFIGURED') throw error;
      throw providerError(this.id, error);
    }
  }

  async verifyOtp({ expectedHash, submittedHash, compare }) {
    return compare(expectedHash, submittedHash);
  }

  async healthCheck() {
    const config = await getSmsConfiguration();
    const credentials = await getSmsProviderCredentials(this.id);
    try {
      requireCredentials(this.id, credentials, ['access_key_id', 'access_key_secret']);
      if (!config.providers.aliyun_sms.templateId) return { status: 'unavailable', errorCode: 'SMS_PROVIDER_NOT_CONFIGURED' };
      const { client, smsModule } = await createAliyunClient(credentials);
      const request = new smsModule.QuerySmsTemplateRequest({ templateCode: config.providers.aliyun_sms.templateId });
      const result = await client.querySmsTemplate(request);
      if (result?.body?.code !== 'OK') throw Object.assign(new Error('Aliyun template query failed'), { code: result?.body?.code || 'PROVIDER_SERVICE_ERROR' });
      return { status: 'healthy', errorCode: null };
    } catch (error) {
      return {
        status: error.code === 'SMS_PROVIDER_NOT_CONFIGURED' ? 'unavailable' : 'degraded',
        errorCode: error.code || 'PROVIDER_HEALTH_CHECK_FAILED',
      };
    }
  }
}

export class FirebasePhoneProvider extends SmsProvider {
  constructor() {
    super('firebase_phone');
  }

  async sendOtp({ phone, recaptchaToken }) {
    const config = await getFirebaseWebConfig();
    if (!config) {
      throw Object.assign(new Error('Firebase web phone auth is not configured'), {
        code: 'SMS_PROVIDER_NOT_CONFIGURED', provider: this.id, retryable: false,
      });
    }
    if (!recaptchaToken) {
      throw Object.assign(new Error('Firebase app verification is required'), {
        code: 'APP_VERIFICATION_REQUIRED', provider: this.id, retryable: false,
      });
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'en' },
        body: JSON.stringify({ phoneNumber: phone.e164, recaptchaToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    ).catch((error) => {
      throw Object.assign(new Error('Firebase verification service is unavailable'), {
        code: 'PROVIDER_UNAVAILABLE', provider: this.id, retryable: true, cause: error,
      });
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.sessionInfo) {
      const raw = payload?.error?.message || `HTTP_${response.status}`;
      const normalized = providerError(this.id, { code: raw });
      throw normalized;
    }
    return { providerSession: payload.sessionInfo };
  }

  async verifyOtp({ providerSession, code }) {
    const config = await getFirebaseWebConfig();
    if (!config) throw Object.assign(new Error('Firebase web phone auth is not configured'), { code: 'SMS_PROVIDER_NOT_CONFIGURED' });
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionInfo: providerSession, code, returnSecureToken: true }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    ).catch((error) => {
      throw Object.assign(new Error('Firebase verification service is unavailable'), {
        code: 'PROVIDER_UNAVAILABLE', provider: this.id, retryable: true, cause: error,
      });
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.localId || !payload.phoneNumber) {
      const raw = payload?.error?.message || `HTTP_${response.status}`;
      const codeMap = {
        INVALID_CODE: 'OTP_INCORRECT',
        SESSION_EXPIRED: 'OTP_EXPIRED',
        SESSION_INFO_EXPIRED: 'OTP_EXPIRED',
        CODE_EXPIRED: 'OTP_EXPIRED',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'OTP_ATTEMPTS_EXCEEDED',
      };
      if (codeMap[raw]) throw Object.assign(new Error('Firebase OTP verification failed'), { code: codeMap[raw], retryable: false });
      throw providerError(this.id, { code: raw });
    }
    return { phone: payload.phoneNumber, providerUserId: payload.localId };
  }

  async healthCheck() {
    const config = await getFirebaseWebConfig();
    if (!config) return { status: 'unavailable', errorCode: 'SMS_PROVIDER_NOT_CONFIGURED' };
    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: `health-${crypto.randomUUID()}` }),
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.status === 400 && payload?.error?.message === 'INVALID_ID_TOKEN') {
        return { status: 'healthy', errorCode: null };
      }
      const raw = String(payload?.error?.message || `HTTP_${response.status}`);
      return { status: 'degraded', errorCode: raw === 'API_KEY_INVALID' ? 'FIREBASE_API_KEY_INVALID' : 'FIREBASE_CONNECTIVITY_FAILED' };
    } catch {
      return { status: 'unavailable', errorCode: 'PROVIDER_UNAVAILABLE' };
    }
  }
}

export async function verifyTencentCaptcha({ ticket, randstr, userIp }) {
  const config = await getSmsConfiguration();
  const credentials = await getSmsProviderCredentials('tencent_captcha');
  requireCredentials('tencent_captcha', credentials, ['secret_id', 'secret_key', 'app_secret_key']);
  const appId = config.providers.tencent_captcha.appId;
  if (!appId || !ticket || !randstr) {
    throw Object.assign(new Error('Captcha verification is not configured'), { code: 'CAPTCHA_NOT_CONFIGURED' });
  }
  const client = await getTencentClient('tencent_captcha', 'tencentcloud-sdk-nodejs-captcha', 'v20190722');
  const result = await client.DescribeCaptchaResult({
    CaptchaType: 9,
    Ticket: ticket,
    UserIp: userIp,
    Randstr: randstr,
    CaptchaAppId: Number(appId),
    AppSecretKey: credentials.app_secret_key,
  });
  if (Number(result?.CaptchaCode) !== 1 || Number(result?.EvilLevel) === 100) {
    throw Object.assign(new Error('Captcha verification failed'), { code: 'CAPTCHA_INVALID' });
  }
  return true;
}

export function isRetryableProviderError(error) {
  return error?.retryable === true;
}
