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
const { getModelCenterSnapshot } = await import('../../lib/services/models.js');
const { probeProviderChannel } = await import('../../lib/services/healthProbe.js');

if (testUrl) await migrations.runMigrations();

const suffix = Date.now().toString(36);
const providerId = `s6_prv_${suffix}`;
const modelId = `s6_probe_${suffix}`;

test.after(async () => {
  if (testUrl) {
    await db.execute('DELETE FROM ops_bill.provider_health_checks WHERE provider = $1', [providerId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.provider_models WHERE provider_id = $1', [providerId]).catch(() => {});
    await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.ai_providers WHERE id = $1', [providerId]).catch(() => {});
  }
  await db.closePgPool();
});

async function latestCheck() {
  return db.queryOne(
    `SELECT status, latency_ms, error_code, details_json
     FROM ops_bill.provider_health_checks
     WHERE provider = $1
     ORDER BY checked_at DESC, id DESC
     LIMIT 1`,
    [providerId]
  );
}

async function snapshotRoute() {
  const snapshot = await getModelCenterSnapshot();
  const model = snapshot.models.find((item) => item.id === modelId);
  return { model, route: model?.routes?.find((r) => r.providerId === providerId) || null };
}

test('探测结论必须同时落当前健康度与探测历史，否则页面的延迟列永远是空的', { skip: !testUrl }, async () => {
  await catalog.createProvider({ id: providerId, name: 'S6 探测', provider_type: 'official' });
  await db.execute(
    `INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category)
     VALUES ($1, $1, 'S6 探测模型', 'S6 探测模型', 'image')`,
    [modelId]
  );
  await db.execute(
    `INSERT INTO models_config (id, provider, name, type, credits_price, cost_usd, is_active)
     VALUES ($1, $2, 'S6 探测模型', 'image', 5, 0.02, TRUE)`,
    [modelId, providerId]
  );
  await catalog.upsertProviderModel({
    model_id: modelId,
    provider_id: providerId,
    provider_model_id: 'probe-v1',
    cost_config: { currency: 'USD', base_cost: 0.03 },
  });

  // 这个供应商没有适配器，探针在发出任何请求之前就失败：不打上游也能验证整条落库链路。
  const result = await probeProviderChannel(providerId);
  assert.equal(result.success, true, '探测流程本身跑完并落库了');
  assert.equal(result.healthStatus, 'degraded', '没接上渠道是待办，不是上游故障');
  assert.equal(result.probeKind, 'credential');
  assert.equal(result.latencyMs, null, '没有网络往返就没有延迟，0ms 是假数字');

  const provider = await catalog.getProviderById(providerId);
  assert.equal(provider.health_status, 'degraded');
  assert.ok(provider.last_health_check_at);
  assert.equal(provider.metadata.last_probe.probe_kind, 'credential');
  assert.equal(provider.metadata.last_probe.latency_ms, null);

  const check = await latestCheck();
  assert.equal(check.status, 'degraded');
  assert.equal(check.latency_ms, null);
  assert.equal(check.details_json.probeKind, 'credential');
  // 模型中心读的是这张表的最近一条；不写它，主表延迟列和「延迟最低」标记就永远是空的。
  assert.equal(check.details_json.source, 'model_center_probe');
});

test('模型中心的健康度与探测延迟来自探测落库的那张表', { skip: !testUrl }, async () => {
  const first = await snapshotRoute();
  assert.ok(first.route, '快照里必须带上这条渠道');
  assert.equal(first.route.healthStatus, 'degraded');
  assert.equal(first.route.probeKind, 'credential');
  assert.equal(first.route.probeLatencyMs, null, '仅凭据校验不能冒充实测延迟');
  assert.ok(first.route.probeCheckedAt, '探测时间必须回读出来');

  // 模拟一次真实的 HTTP 实测探测：延迟有值、口径为 http，快照必须跟着变。
  await db.execute(
    `INSERT INTO ops_bill.provider_health_checks
       (id, provider, status, latency_ms, error_code, details_json, checked_at)
     VALUES ($1, $2, 'healthy', 123, NULL, $3::jsonb, $4)`,
    [
      `s6_http_${suffix}`,
      providerId,
      JSON.stringify({ probeKind: 'http', message: 'OK', source: 'model_center_probe' }),
      new Date(Date.now() + 60_000).toISOString(),
    ]
  );
  await catalog.updateProviderHealth(providerId, { healthStatus: 'healthy', latencyMs: 123, probeKind: 'http' });

  const next = await snapshotRoute();
  assert.equal(next.route.probeLatencyMs, 123);
  assert.equal(next.route.probeKind, 'http');
  assert.equal(next.route.healthStatus, 'healthy');
  assert.equal(next.model.probeLatencyMs, 123, '模型行的延迟取当前实际会走的那条渠道');
});
