// 支付渠道状态的进程内缓存：判定一次要打十余条密钥库查询，而 /api/billing/plans
// 是未登录可读的公开接口。逻辑独立成模块是为了能被 node --test 直接驱动——
// providerCredentials.js 经由 server-only 的依赖链在测试进程里根本 import 不动。
export function createStatusCache({ compute, ttlMs, cacheable = () => true }) {
  let entry = null;
  let pending = null;

  async function run(ttl) {
    try {
      const value = await compute();
      entry = ttl > 0 && cacheable(value) ? { value, expiresAt: Date.now() + ttl } : null;
      return value;
    } finally {
      pending = null;
    }
  }

  return {
    get({ force = false } = {}) {
      const ttl = ttlMs();
      if (!force && ttl > 0 && entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.value);
      if (pending) return pending;
      pending = run(ttl);
      return pending;
    },
    invalidate() {
      entry = null;
    },
  };
}
