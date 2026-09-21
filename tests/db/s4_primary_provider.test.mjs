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
const { routeGenerationTask } = await import('../../lib/services/smartRouter.js');
const { setPrimaryProvider } = await import('../../lib/services/modelRouting.js');
const { getModelWithOperations } = await import('../../lib/repositories/models.js');
const { decorateModel } = await import('../../lib/services/models.js');

if (testUrl) await migrations.runMigrations();

// 与运行时路由器同一批真实网关标识：换成假 provider 会被 Adapter 硬过滤掉，
// 那时测到的是「过滤逻辑」而不是「钉选逻辑」。
// 刻意选 s1/s2/s3 没用到的网关：隔离库是全 suite 共享的，同一个网关行的
// health_status / circuit_state 被别的文件并发翻动时，本文件的断言会变成随机噪声。
const KEY_ENVS = { openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY', volcengine: 'VOLCENGINE_API_KEY' };
// 每个网关在 providerSecrets 里可能有多个别名环境变量，判「无凭据」必须全清掉。
const EXTRA_KEY_ENVS = { openai: ['OPENAI_KEY'], volcengine: ['ARK_API_KEY', 'VOLC_API_KEY'] };
const ALL_KEY_ENV_NAMES = [
  ...Object.values(KEY_ENVS),
  ...Object.values(EXTRA_KEY_ENVS).flat(),
];
const originalEnv = Object.fromEntries(ALL_KEY_ENV_NAMES.map((name) => [name, process.env[name]]));

const stamp = Date.now().toString(36);
const actor = { id: 'admin_s4', email: `s4-admin-${stamp}@example.test` };
const touched = new Set();
let seq = 0;

async function resetGateways() {
  for (const provider of Object.keys(KEY_ENVS)) {
    await db.execute(`
      UPDATE ai_studio.ai_providers
      SET circuit_state = 'closed', consecutive_failures = 0, circuit_opened_at = NULL,
          health_status = 'healthy', enabled = TRUE
      WHERE id = $1
    `, [provider]).catch(() => {});
  }
}

/** 播种一个标准模型 + 老目录行 + 若干渠道；返回 modelId 与 channelId 映射。 */
async function seedModel({ channels, policy = null }) {
  const modelId = `s4m_${stamp}_${(seq += 1)}`;
  touched.add(modelId);
  await db.execute(`
    INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, status)
    VALUES ($1, $1, $1, 'S4 主渠道模型', 'image', 'active')
  `, [modelId]);
  await db.execute(`
    INSERT INTO models_config (id, provider, name, type, credits_price, is_active)
    VALUES ($1, 'muapi', 'S4 主渠道模型', 'image', 5, TRUE)
  `, [modelId]);
  // 老目录对账会给每条 models_config 补一条 provider_model_id = 模型 id 的 muapi 渠道。
  // 先落成停用，对账就会跳过它，测试自己的渠道集合才不会被凭空加宽。
  await db.execute(`
    INSERT INTO ai_studio.ai_providers (id, slug, name, provider_type)
    VALUES ('muapi', 'muapi', 'muapi', 'aggregator')
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(`
    INSERT INTO ai_studio.provider_models (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config)
    VALUES ($1, $2, 'muapi', $2, FALSE, 100, '{"currency":"USD","base_cost":0}'::jsonb)
    ON CONFLICT DO NOTHING
  `, [`pm_${modelId}_reconcile`, modelId]);

  const ids = {};
  for (const [index, channel] of channels.entries()) {
    await db.execute(`
      INSERT INTO ai_studio.ai_providers (id, slug, name, provider_type)
      VALUES ($1, $1, $1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [channel.provider, channel.providerType || 'aggregator']);
    const channelId = `${modelId}_pm${index}`;
    await db.execute(`
      INSERT INTO ai_studio.provider_models
        (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    `, [
      channelId, modelId, channel.provider, `s4-endpoint-${channel.provider}`,
      channel.enabled !== false, channel.priority ?? 100,
      JSON.stringify({ currency: channel.currency || 'USD', base_cost: channel.baseCost ?? 0 }),
      JSON.stringify(channel.metadata || {}),
    ]);
    ids[channel.provider] = channelId;
  }
  if (policy) await catalog.upsertRoutingPolicy({ model_id: modelId, ...policy });
  await catalog.upsertRoutingPolicy({
    model_id: modelId,
    circuit_breaker_config: { failure_threshold: 1000, cooling_period_sec: 60, half_open_requests: 1 },
  });
  await resetGateways();
  return { modelId, ids };
}

function primaryChannelId(model) {
  return (model.routes || []).filter((route) => route.isPrimary).map((route) => route.id);
}

function applyServerKeys() {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value !== undefined) process.env[name] = value;
  }
  for (const [provider, envName] of Object.entries(KEY_ENVS)) {
    if (!process.env[envName]) process.env[envName] = `server-key-${provider}`;
  }
}

test.beforeEach(async () => {
  for (const name of Object.values(KEY_ENVS)) delete process.env[name];
  applyServerKeys();
  await resetGateways();
});

test.after(async () => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await resetGateways();
  if (testUrl) {
    for (const modelId of touched) {
      await db.execute('DELETE FROM admin_audit_logs WHERE target_id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM ai_studio.routing_policies WHERE model_id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM ai_studio.provider_models WHERE model_id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
    }
  }
  await db.closePgPool();
});

test('钉选主渠道覆盖评分结果，后台显示的那家就是运行时真的调的那家', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({
    channels: [
      { provider: 'volcengine', baseCost: 0.05, priority: 110 },
      { provider: 'openai', baseCost: 0.005, priority: 90 },
    ],
    policy: { routing_mode: 'cost', weights: { cost: 0.9, success_rate: 0.05, speed: 0.03, capacity: 0.02 } },
  });

  const before = await routeGenerationTask({ modelId, parameters: {}, log: false });
  assert.equal(before.selectedProviderId, 'openai', '未钉选时成本模式选便宜渠道');

  const switched = await setPrimaryProvider({ actor, modelId, channelId: ids.volcengine, requestId: 'req-s4-pin' });
  assert.equal(switched.error, undefined, `切换失败：${switched.error}`);
  assert.equal(switched.model.primaryChannelId, ids.volcengine, '回给前端的行必须已经指向新渠道');
  assert.equal(switched.model.primaryProviderId, 'volcengine');
  assert.deepEqual(primaryChannelId(switched.model), [ids.volcengine], '一个模型只能有一个钉选渠道');

  const after = await routeGenerationTask({ modelId, parameters: {}, log: false });
  assert.equal(after.selectedProviderId, 'volcengine', '钉选必须优先于评分');
  assert.match(after.selectionReason, /钉选渠道/);
});

test('切换结果落库，重新读取与列表刷出来的是同一行真值', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({
    channels: [
      { provider: 'openai', baseCost: 0.02, priority: 100 },
      { provider: 'google', baseCost: 0.03, priority: 80 },
    ],
  });

  const first = await setPrimaryProvider({ actor, modelId, channelId: ids.openai, requestId: 'req-s4-persist-1' });
  assert.equal(first.error, undefined, `切换失败：${first.error}`);
  const second = await setPrimaryProvider({ actor, modelId, channelId: ids.google, requestId: 'req-s4-persist-2' });
  assert.equal(second.error, undefined, `切换失败：${second.error}`);

  const reloaded = decorateModel(await getModelWithOperations(modelId));
  assert.equal(reloaded.primaryChannelId, ids.google, '改完必须真的写进了 provider_models');
  assert.deepEqual(primaryChannelId(reloaded), [ids.google], '钉选会跟着移动，不会留下两个 true');
  assert.equal(reloaded.officialCostUsd, 0.03, '官方成本随实际主渠道变化，而不是固定读某一家');

  const raw = await db.queryMany(
    `SELECT id, metadata ->> 'primary' AS primary_flag
     FROM ai_studio.provider_models WHERE model_id = $1 AND enabled`,
    [modelId],
  );
  assert.deepEqual(
    raw.filter((row) => row.primary_flag === 'true').map((row) => row.id),
    [ids.google],
  );
});

test('渠道不可承接流量时拒绝切换，原供应商保持不变', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({
    channels: [
      { provider: 'openai', baseCost: 0.02, priority: 100 },
      { provider: 'google', baseCost: 0.01, priority: 120, enabled: false },
    ],
  });
  const initial = await setPrimaryProvider({ actor, modelId, channelId: ids.openai, requestId: 'req-s4-keep' });
  assert.equal(initial.error, undefined, `切换失败：${initial.error}`);

  const result = await setPrimaryProvider({ actor, modelId, channelId: ids.google, requestId: 'req-s4-refuse' });
  assert.match(result.error, /不可承接流量/);
  assert.match(result.error, /该渠道已停用/);

  const reloaded = decorateModel(await getModelWithOperations(modelId));
  assert.equal(reloaded.primaryChannelId, ids.openai, '失败必须保留原供应商，不能出现半切换');
});

test('缺少凭据的渠道不能被设为默认供应商', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({
    channels: [
      { provider: 'openai', baseCost: 0.02, priority: 100 },
      { provider: 'google', baseCost: 0.01, priority: 120 },
    ],
  });
  assert.equal(
    (await setPrimaryProvider({ actor, modelId, channelId: ids.openai, requestId: 'req-s4-cred-1' })).error,
    undefined,
  );

  for (const name of ALL_KEY_ENV_NAMES) delete process.env[name];
  const result = await setPrimaryProvider({ actor, modelId, channelId: ids.google, requestId: 'req-s4-cred-2' });
  assert.match(String(result.error), /未配置 API 凭据|不可承接流量/);

  // 凭据缺失时「有效主渠道」会退化成故障展示位，先恢复再回读才测得到持久化结果。
  applyServerKeys();
  assert.equal(decorateModel(await getModelWithOperations(modelId)).primaryChannelId, ids.openai);
});

test('拒绝把别的模型的渠道钉选到当前模型上', { skip: !testUrl }, async () => {
  const owner = await seedModel({ channels: [{ provider: 'openai', baseCost: 0.02 }] });
  const victim = await seedModel({ channels: [{ provider: 'google', baseCost: 0.02 }] });
  assert.equal(
    (await setPrimaryProvider({
      actor, modelId: victim.modelId, channelId: victim.ids.google, requestId: 'req-s4-cross-1',
    })).error,
    undefined,
  );

  const result = await setPrimaryProvider({
    actor, modelId: victim.modelId, channelId: owner.ids.openai, requestId: 'req-s4-cross-2',
  });
  assert.match(result.error, /不属于该模型/);
  assert.equal(decorateModel(await getModelWithOperations(victim.modelId)).primaryChannelId, victim.ids.google);
  assert.deepEqual(
    primaryChannelId(decorateModel(await getModelWithOperations(owner.modelId))),
    [],
    '跨模型请求不能顺手给别人的模型打钉',
  );
});

test('未知渠道与未知模型都返回业务错误，不写任何数据', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({ channels: [{ provider: 'openai', baseCost: 0.02 }] });

  assert.match((await setPrimaryProvider({ actor, modelId, channelId: 'pm_missing', requestId: 'r' })).error, /未找到/);
  assert.match((await setPrimaryProvider({ actor, modelId: 'missing_model', channelId: 'x', requestId: 'r' })).error, /未找到/);
  assert.match(String((await setPrimaryProvider({ actor, modelId, channelId: '', requestId: 'r' })).error), /请指定/);
  assert.deepEqual(primaryChannelId(decorateModel(await getModelWithOperations(modelId))), []);
  assert.equal(decorateModel(await getModelWithOperations(modelId)).primaryChannelId, ids.openai);
});

test('切换写入高风险审计事件，记录原供应商与新供应商', { skip: !testUrl }, async () => {
  const { modelId, ids } = await seedModel({
    channels: [
      { provider: 'openai', baseCost: 0.02, priority: 100 },
      { provider: 'google', baseCost: 0.04, priority: 90 },
    ],
  });
  assert.equal(
    (await setPrimaryProvider({ actor, modelId, channelId: ids.openai, requestId: 'req-s4-audit-1' })).error,
    undefined,
  );
  const result = await setPrimaryProvider({ actor, modelId, channelId: ids.google, requestId: 'req-s4-audit-2' });
  assert.equal(result.error, undefined, `切换失败：${result.error}`);

  const logs = await db.queryMany(
    `SELECT action, risk_level, actor_email, target_type, target_id, before_json, after_json, request_id
     FROM admin_audit_logs WHERE target_id = $1 ORDER BY created_at ASC`,
    [modelId],
  );
  assert.equal(logs.length, 2, '每次切换各留一条审计');
  const [second] = logs.slice(-1);
  assert.equal(second.action, 'models.provider_switch');
  assert.equal(second.risk_level, 'high');
  assert.equal(second.actor_email, actor.email);
  assert.equal(second.target_type, 'model');
  assert.equal(second.request_id, 'req-s4-audit-2');
  assert.equal(second.after_json.channelId, ids.google);
  assert.equal(second.after_json.providerId, 'google');
  assert.equal(second.before_json.previousPrimaryChannels[0].channelId, ids.openai);
});
