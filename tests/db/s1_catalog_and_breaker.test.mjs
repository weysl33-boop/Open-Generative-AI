import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const catalog = await import('../../lib/repositories/aiCatalog.js');
const breaker = await import('../../lib/services/circuitBreaker.js');

if (testUrl) await migrations.runMigrations();

const suffix = Date.now().toString(36);
const modelId = `s1_model_${suffix}`;
const providerId = `s1_prv_${suffix}`;

async function seedCatalog() {
  await catalog.createProvider({ id: providerId, name: 'S1 Probe', api_mode: 'async_poll' });
  await db.execute(`
    INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'image', now(), now())
  `, [modelId, `${modelId}_slug`, 'S1 Probe Model', 'S1 探测模型']);
}

test.after(async () => {
  if (testUrl) {
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.ai_providers WHERE id = $1', [providerId]).catch(() => {});
  }
  await db.closePgPool();
});

test('createProvider 不能写入 CHECK 之外的 api_mode', { skip: !testUrl }, async () => {
  await seedCatalog();
  const provider = await catalog.getProviderById(providerId);
  // 'async_poll' 违反 CHECK ('async','sync','stream')，旧实现会直接让建供应商报错。
  assert.equal(provider.api_mode, 'async');
});

test('upsertRoutingPolicy 局部保存不得重置熔断配置', { skip: !testUrl }, async () => {
  await catalog.upsertRoutingPolicy({
    model_id: modelId,
    routing_mode: 'balanced',
    circuit_breaker_config: { failure_threshold: 9, cooling_period_sec: 300, half_open_requests: 4 },
  });

  // 路由编辑页只提交 routing_mode / weights / failover_enabled。
  await catalog.upsertRoutingPolicy({ model_id: modelId, routing_mode: 'cost' });

  const policy = await catalog.getRoutingPolicy(modelId);
  assert.equal(policy.routing_mode, 'cost');
  assert.equal(Number(policy.circuit_breaker_config.failure_threshold), 9);
  assert.equal(Number(policy.circuit_breaker_config.cooling_period_sec), 300);
  assert.equal(policy.failover_enabled, true);
});

test('upsertModelPricing 局部保存不得清空公式与折扣', { skip: !testUrl }, async () => {
  await catalog.upsertModelPricing({
    model_id: modelId,
    pricing_type: 'formula',
    base_credits: 12,
    formula_config: { per_image: 5, per_second: 2 },
    subscription_discounts: { pro: 0.85 },
  });

  await catalog.upsertModelPricing({ model_id: modelId, base_credits: 20 });

  const pricing = await catalog.getModelPricing(modelId);
  assert.equal(Number(pricing.base_credits), 20);
  assert.equal(pricing.pricing_type, 'formula');
  assert.equal(Number(pricing.formula_config.per_image), 5);
  assert.equal(Number(pricing.subscription_discounts.pro), 0.85);
});

test('upsertProviderModel 局部保存不得清空成本与重试配置', { skip: !testUrl }, async () => {
  const pm = await catalog.upsertProviderModel({
    model_id: modelId,
    provider_id: providerId,
    provider_model_id: 'probe-v1',
    cost_config: { currency: 'USD', base_cost: 0.42 },
    max_retries: 0,
    concurrency_limit: 3,
  });
  const pmId = pm.id || pm;

  await catalog.upsertProviderModel({ id: pmId, enabled: false });

  const channel = await catalog.getProviderModelById(pmId);
  assert.equal(channel.enabled, false);
  assert.equal(Number(channel.cost_config.base_cost), 0.42);
  assert.equal(Number(channel.concurrency_limit), 3);
});

test('熔断阈值触发后写入合法状态且能被半开探测读取', { skip: !testUrl }, async () => {
  await catalog.upsertRoutingPolicy({
    model_id: modelId,
    circuit_breaker_config: { failure_threshold: 2, cooling_period_sec: 1, half_open_requests: 1 },
  });

  const resolved = await breaker.resolveCircuitConfig(modelId);
  assert.equal(Number(resolved.failureThreshold), 2);
  assert.equal(Number(resolved.coolingPeriodSec), 1);

  await breaker.recordProviderFailure(providerId, { failureThreshold: 2 });
  let provider = await catalog.getProviderById(providerId);
  assert.equal(provider.circuit_state, 'closed');

  await breaker.recordProviderFailure(providerId, { failureThreshold: 2 });
  provider = await catalog.getProviderById(providerId);
  // 旧实现写入 'open'，违反 CHECK ('closed','circuit_open','half_open')，熔断器从未真正生效。
  assert.equal(provider.circuit_state, 'circuit_open');
  assert.equal(Number(provider.consecutive_failures), 2);
  assert.ok(provider.circuit_opened_at);

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const halfOpened = await breaker.checkAndHalfOpenProvider(providerId, 1);
  assert.equal(halfOpened, true);
  provider = await catalog.getProviderById(providerId);
  assert.equal(provider.circuit_state, 'half_open');

  await breaker.recordProviderSuccess(providerId);
  provider = await catalog.getProviderById(providerId);
  assert.equal(provider.circuit_state, 'closed');
  assert.equal(Number(provider.consecutive_failures), 0);
});

test('无 24h 样本时健康概览不得虚构 100% 成功率', { skip: !testUrl }, async () => {
  const overview = await breaker.getChannelsHealthOverview();
  const row = overview.find((channel) => channel.id === providerId);
  assert.ok(row, 'probe provider should appear in health overview');
  assert.equal(row.totalAttempts24h, 0);
  assert.equal(row.successRate24h, null);
  // 没有样本也没有探针时，延迟同样是 null，而不是冒充"这个渠道 0ms"。
  assert.equal(row.avgLatencyMs24h, null);
  assert.equal(row.lastProbe, null);
});

test('探测延迟与探针口径必须落库，且整块替换 last_probe', { skip: !testUrl }, async () => {
  await catalog.updateProvider(providerId, { metadata: { channel_note: 'keep-me' } });

  await catalog.updateProviderHealth(providerId, {
    healthStatus: 'healthy',
    latencyMs: 182.6,
    probeKind: 'http',
  });

  let provider = await catalog.getProviderById(providerId);
  // jsonb 顶层合并：last_probe 之外的渠道配置不能被探针写没。
  assert.equal(provider.metadata.channel_note, 'keep-me');
  assert.equal(provider.metadata.last_probe.latency_ms, 183);
  assert.equal(provider.metadata.last_probe.probe_kind, 'http');
  assert.ok(provider.metadata.last_probe.probed_at);

  // 仅校验凭据的探测没有网络往返：latency_ms 必须是 null，不能留上一次的 183。
  await catalog.updateProviderHealth(providerId, {
    healthStatus: 'degraded',
    latencyMs: null,
    probeKind: 'credential',
  });
  provider = await catalog.getProviderById(providerId);
  assert.equal(provider.metadata.last_probe.latency_ms, null);
  assert.equal(provider.metadata.last_probe.probe_kind, 'credential');

  const overview = await breaker.getChannelsHealthOverview();
  const row = overview.find((channel) => channel.id === providerId);
  assert.equal(row.lastProbe.probeKind, 'credential');
  assert.equal(row.lastProbe.latencyMs, null);
  assert.ok(row.lastProbe.probedAt);
});
