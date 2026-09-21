/**
 * E2E Test Suite - Unified HTTP API Client
 * 遵循 Opaque-box 黑盒测试原则，封装针对服务端 API 的完整契约调用与 Cookie 会话保持
 */
import { generateStripeSignature } from './mock-provider.mjs';

export class ApiClient {
  constructor(baseURL = null) {
    this.baseURL = (baseURL || process.env.E2E_BASE_URL || process.env.PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    this.cookies = new Map();
    this.currentUser = null;
  }

  /**
   * 提取并保存响应中的 Set-Cookie
   */
  _extractCookies(response) {
    const getSetCookie = response.headers?.getSetCookie?.bind(response.headers);
    let cookieHeaders = [];
    if (typeof getSetCookie === 'function') {
      cookieHeaders = getSetCookie();
    } else {
      const single = response.headers?.get?.('set-cookie');
      if (single) cookieHeaders = [single];
    }

    for (const header of cookieHeaders) {
      const parts = header.split(';');
      const [nameVal] = parts;
      if (nameVal) {
        const eqIdx = nameVal.indexOf('=');
        if (eqIdx > 0) {
          const name = nameVal.slice(0, eqIdx).trim();
          const val = nameVal.slice(eqIdx + 1).trim();
          this.cookies.set(name, val);
        }
      }
    }
  }

  /**
   * 构造 Cookie 请求头字符串
   */
  _getCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(([name, val]) => `${name}=${val}`)
      .join('; ');
  }

  /**
   * 清除会话 Cookie
   */
  clearCookies() {
    this.cookies.clear();
    this.currentUser = null;
  }

  setSessionToken(token) {
    if (token) {
      this.cookies.set('ko_session', token);
    }
  }

  /**
   * 底层 HTTP 请求分发器
   */
  async request(method, path, { body = null, headers = {}, rawResponse = false } = {}) {
    const url = `${this.baseURL}${path.startsWith('/') ? path : `/${path}`}`;
    const reqHeaders = {
      'Accept': 'application/json, text/plain, */*',
      'Origin': this.baseURL,
      'User-Agent': 'KoyoSIM-E2E-Runner/1.0',
      ...headers,
    };

    const cookieHeader = this._getCookieHeader();
    if (cookieHeader) {
      reqHeaders['Cookie'] = cookieHeader;
    }

    let reqBody = undefined;
    if (body !== null && body !== undefined) {
      if (typeof body === 'string') {
        reqBody = body;
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'text/plain; charset=utf-8';
        }
      } else {
        reqBody = JSON.stringify(body);
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: reqHeaders,
      body: reqBody,
    });

    this._extractCookies(res);

    if (rawResponse) {
      const text = await res.text();
      return {
        status: res.status,
        headers: res.headers,
        text,
        ok: res.ok,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      data = await res.text();
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      data,
    };
  }

  // ---------------- 身份认证契约 ----------------

  async register({ email, password }) {
    const res = await this.request('POST', '/api/auth/register', {
      body: { email, password },
    });
    if (res.ok && res.data?.user) {
      this.currentUser = res.data.user;
    }
    return res;
  }

  async login({ email, password }) {
    const res = await this.request('POST', '/api/auth/login', {
      body: { email, password },
    });
    if (res.ok && res.data?.user) {
      this.currentUser = res.data.user;
    }
    return res;
  }

  async logout() {
    const res = await this.request('POST', '/api/auth/logout');
    this.clearCookies();
    return res;
  }

  async me() {
    const res = await this.request('GET', '/api/auth/me');
    if (res.ok && res.data?.user) {
      this.currentUser = res.data.user;
    }
    return res;
  }

  // ---------------- 统一生成任务契约 ----------------

  async createGeneration({
    model = 'nano-fast',
    prompt,
    parameters = {},
    idempotencyKey = null,
    studioId = 'studio',
    label = null,
  } = {}) {
    const headers = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return this.request('POST', '/api/generations', {
      headers,
      body: {
        model,
        prompt,
        parameters,
        studioId,
        label,
      },
    });
  }

  async getGeneration(id) {
    return this.request('GET', `/api/generations?id=${encodeURIComponent(id)}`);
  }

  async listGenerations(limit = 50) {
    return this.request('GET', `/api/generations?limit=${Number(limit)}`);
  }

  // ---------------- 支付与 Webhook 契约 ----------------

  async createCheckout({ planId = 'pro', provider = 'stripe', idempotencyKey = null }) {
    const headers = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return this.request('POST', '/api/billing/checkout', {
      headers,
      body: {
        planId,
        provider,
        idempotencyKey,
      },
    });
  }

  async sendStripeWebhook({ event, signature = null, secret = null, rawBody = null }) {
    const payloadStr = rawBody !== null ? rawBody : JSON.stringify(event);
    const sigHeader = signature || (secret ? generateStripeSignature(payloadStr, secret) : '');

    return this.request('POST', '/api/billing/webhooks/stripe', {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sigHeader,
      },
      body: payloadStr,
    });
  }

  // ---------------- 社区作品契约 ----------------

  async createCommunityPost({
    creationId = null,
    title = '测试作品',
    description = '',
    mediaType = 'image',
    mediaUrl,
    coverUrl = null,
    prompt = '',
    negativePrompt = '',
    modelName = 'nano-fast',
    parameters = {},
    tags = [],
  }) {
    return this.request('POST', '/api/community/posts', {
      body: {
        creationId,
        title,
        description,
        mediaType,
        mediaUrl,
        coverUrl: coverUrl || mediaUrl,
        prompt,
        negativePrompt,
        modelName,
        parameters,
        tags,
      },
    });
  }

  async listCommunityPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request('GET', `/api/community/posts${query ? `?${query}` : ''}`);
  }

  // ---------------- 法律与合规页面 ----------------

  async getLegalPage(slug) {
    return this.request('GET', `/${slug.replace(/^\/+/, '')}`, { rawResponse: true });
  }

  async getHealth() {
    return this.request('GET', '/api/health');
  }
}

export function createApiClient(baseURL = null) {
  return new ApiClient(baseURL);
}
