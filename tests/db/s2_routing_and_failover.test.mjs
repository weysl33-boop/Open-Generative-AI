import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

// 预算常量在模块加载时读取，必须在导入生命周期服务之前定死，
// 否则一次测试的失败次数会跟着开发机的环境变量漂。
process.env.GENERATION_MAX_ATTEMPTS = '3';
process.env.GENERATION_POLL_BUDGET_MS = '0';

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { reserveTestUserId } = await import('../../scripts/test-user-id-fixtures.mjs');
const catalog = await import('../../lib/repositories/aiCatalog.js');
const { routeGenerationTask } = await import('../../lib/services/smartRouter.js');
const { createGenerationTask, processGenerationTask, resumeGenerationTask } = await import('../../lib/services/generationCore.js');
const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');

if (testUrl) await migrations.runMigrations();

// 渠道必须是有 Adapter 的真实网关标识，否则路由会以 ADAPTER_NOT_IMPLEMENTED 过滤掉。
const GATEWAYS = ['muapi', 'kling', 'minimax'];
const KEY_ENVS = { muapi: 'MUAPI_API_KEY', kling: 'KLING_API_KEY', minimax: 'MINIMAX_API_KEY' };
const originalEnv = Object.fromEntries(Object.values(KEY_ENVS).map((name) => [name, process.env[name]]));

const stamp = Date.now().toString(36);
const touched = new Set();

test.beforeEach(() => {
  for (const [provider, envName] of Object.entries(KEY_ENVS)) {
    delete process.env[envName];
    process.env[envName] = `server-key-${provider}`;
  }
});

test.after(async () => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (testUrl) {
    // 熔断计数写的是共享网关行，用例之间必须互不污染。
    for (const provider of GATEWAYS) {
      await db.execute(`
        UPDATE ai_studio.ai_providers
        SET circuit_state = 'closed', consecutive_failures = 0, circuit_opened_at = NULL, health_status = 'healthy'
        WHERE id = $1
      `, [provider]).catch(() => {});
    }
    for (const modelId of touched) {
      await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
    }
  }
  await db.closePgPool();
});

let channelSeq = 0;

/** 在标准目录 + 老目录里同时播种一个模型，并挂上若干渠道。 */
async function seedModel({ channels, policy = null }) {
  const modelId = `s2m_${stamp}_${(channelSeq += 1)}`;
  touched.add(modelId);
  await db.execute(`
    INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, status)
    VALUES ($1, $1, $1, 'S2 路由模型', 'image', 'active')
  `, [modelId]);
  await db.execute(`
    INSERT INTO models_config (id, provider, name, type, credits_price, is_active)
    VALUES ($1, 'muapi', 'S2 路由模型', 'image', 5, TRUE)
  `, [modelId]);
  // 老目录对账会给每条 models_config 补一条 provider_model_id = 模型 id 的 muapi 渠道。
  // 集成测试共用同一个隔离库，别的用例并发触发对账时不能给我们的模型凭空加渠道，
  // 所以这里先把那条记录落成「停用」：对账看到它就跳过，只取启用渠道的路由也看不到它。
  await db.execute(`
    INSERT INTO ai_studio.ai_providers (id, slug, name, provider_type)
    VALUES ('muapi', 'muapi', 'muapi', 'aggregator')
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(`
    INSERT INTO ai_studio.provider_models (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config)
    VALUES ($1, $2, 'muapi', $2, FALSE, 100, '{"currency":"USD","base_cost":0}'::jsonb)
    ON CONFLICT DO NOTHING
  `, [`pm_${modelId}_muapi`, modelId]);
  for (const [index, channel] of channels.entries()) {
    await db.execute(`
      INSERT INTO ai_studio.ai_providers (id, slug, name, provider_type)
      VALUES ($1, $1, $1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [channel.provider, channel.providerType || 'aggregator']);
    await db.execute(`
      INSERT INTO ai_studio.provider_models
        (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config, capabilities, concurrency_limit)
      VALUES ($1, $2, $3, $4, TRUE, $5, $6::jsonb, $7::jsonb, $8)
    `, [
      `${modelId}_pm${index}`, modelId, channel.provider, channel.endpoint || 's2-endpoint',
      channel.priority ?? 100,
      JSON.stringify({ currency: channel.currency || 'USD', base_cost: channel.baseCost ?? 0 }),
      JSON.stringify(channel.capabilities || {}),
      channel.concurrencyLimit ?? 10,
    ]);
  }
  if (policy) await catalog.upsertRoutingPolicy({ model_id: modelId, ...policy });
  // 熔断阈值放宽：网关行是共享的，测试不应真的把 muapi 判熔断。
  await catalog.upsertRoutingPolicy({
    model_id: modelId,
    circuit_breaker_config: { failure_threshold: 1000, cooling_period_sec: 60, half_open_requests: 1 },
  });
  return modelId;
}

async function seedUser() {
  const userId = await reserveTestUserId((sql, params) => db.query(sql, params));
  await db.execute(`
    INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
    VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')
  `, [userId, `${userId}@example.test`]);
  await grantPerpetualCredits(userId, 50, 'S2 路由测试额度', userId, `s2:seed:${userId}`);
  return userId;
}

async function cleanupUser(userId) {
  await db.execute('DELETE FROM credit_reservations WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM creations WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
}

function fakeFactory({ failures = {}, submitted = null, pollsBeforeDone = 0 } = {}) {
  const calls = [];
  const polling = {};
  const factory = async ({ provider, providerModelId, apiKey }) => ({
    providerId: provider,
    async submit({ creation }) {
      calls.push({ provider, action: 'submit', providerModelId, apiKey, model: creation.model });
      const failure = failures[provider];
      if (failure) throw Object.assign(new Error(`模拟 ${provider} 失败`), { code: failure });
      if (submitted === 'async') {
        polling[provider] = 0;
        return { status: 'processing', providerRequestId: `s2_${provider}`, resultUrl: null, actualCostUsd: 0 };
      }
      return {
        status: 'succeeded',
        providerRequestId: `s2_${provider}`,
        resultUrl: `/uploads/creations/s2-${provider}.png`,
        actualCostUsd: 0.01,
        metadata: { via: 'fixture' },
      };
    },
    async poll({ providerRequestId }) {
      calls.push({ provider, action: 'poll', providerRequestId });
      polling[provider] = (polling[provider] || 0) + 1;
      if (polling[provider] <= pollsBeforeDone) {
        return { status: 'processing', providerRequestId, resultUrl: null, actualCostUsd: 0 };
      }
      return {
        status: 'succeeded',
        providerRequestId,
        resultUrl: `/uploads/creations/s2-${provider}.png`,
        actualCostUsd: 0.02,
        metadata: { via: 'fixture-poll' },
      };
    },
  });
  factory.calls = calls;
  return factory;
}

function outcomeOf(result) {
  const view = {
    success: result?.success,
    pending: result?.pending,
    deferred: result?.deferred,
    idempotent: result?.idempotent,
    skipped: result?.skipped,
    requeued: result?.requeued,
    failoverQueued: result?.failoverQueued,
    status: result?.creation?.status,
  };
  return Object.fromEntries(Object.entries(view).filter(([, value]) => value !== undefined));
}

test('路由只在同一标准模型的渠道间选择，并按后台权重决定先后', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      // 优先级更高但更贵：得分只由权重决定，priority 只是微小的同分裁决。
      { provider: 'muapi', endpoint: 'expensive-endpoint', baseCost: 0.05, priority: 110 },
      { provider: 'kling', endpoint: 'cheap-endpoint', baseCost: 0.005, priority: 90 },
    ],
    policy: { routing_mode: 'cost', weights: { cost: 0.9, success_rate: 0.05, speed: 0.03, capacity: 0.02 } },
  });

  const route = await routeGenerationTask({ modelId, parameters: {}, log: false });
  assert.equal(route.routingMode, 'cost');
  assert.equal(route.selectedProviderId, 'kling', '成本模式必须选便宜渠道，而不是 priority 高的那家');
  assert.equal(route.selectedProviderModelId, 'cheap-endpoint', '要调用渠道端点，不是标准模型名');
  assert.ok(Math.abs(route.weights.cost - 0.9) < 1e-6, '权重来自 routing_policies，不是代码常量');
  assert.ok(route.candidates.length === 2);
});

test('没有服务端凭据的渠道会被过滤，且绝不借用别家密钥', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'kling-v2', baseCost: 0.001, priority: 120 },
      { provider: 'muapi', endpoint: 'muapi-kling', baseCost: 0.02, priority: 80 },
    ],
    policy: { routing_mode: 'cost' },
  });
  delete process.env.KLING_API_KEY;

  const route = await routeGenerationTask({ modelId, parameters: {}, log: false });
  assert.equal(route.selectedProviderId, 'muapi');
  assert.ok(route.rejected.some((r) => r.providerId === 'kling' && r.reason === 'PROVIDER_NOT_CONFIGURED'));
});

test('熔断中与不健康的渠道不参与评分', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'minimax', endpoint: 'hailuo', baseCost: 0.001 },
      { provider: 'kling', endpoint: 'kling-v2', baseCost: 0.002 },
      { provider: 'muapi', endpoint: 'muapi-any', baseCost: 0.003 },
    ],
    policy: { routing_mode: 'cost' },
  });
  try {
    await db.execute(`UPDATE ai_studio.ai_providers SET circuit_state = 'circuit_open' WHERE id = 'minimax'`);
    await db.execute(`UPDATE ai_studio.ai_providers SET health_status = 'unhealthy' WHERE id = 'kling'`);

    const route = await routeGenerationTask({ modelId, parameters: {}, log: false });
    assert.equal(route.selectedProviderId, 'muapi');
    assert.ok(route.rejected.some((r) => r.providerId === 'minimax' && r.reason === 'CIRCUIT_OPEN'));
    assert.ok(route.rejected.some((r) => r.providerId === 'kling' && r.reason.startsWith('UNHEALTHY')));
  } finally {
    await db.execute(`UPDATE ai_studio.ai_providers SET circuit_state = 'closed' WHERE id = 'minimax'`);
    await db.execute(`UPDATE ai_studio.ai_providers SET health_status = 'healthy' WHERE id = 'kling'`);
  }
});

test('渠道声明不支持的入参不会被选中', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'no-duration', baseCost: 0.001, capabilities: { unsupported_parameters: ['duration'] } },
      { provider: 'muapi', endpoint: 'all-params', baseCost: 0.02 },
    ],
    policy: { routing_mode: 'cost' },
  });

  const route = await routeGenerationTask({
    modelId,
    parameters: { duration: 10, aspect_ratio: '16:9' },
    log: false,
  });
  assert.equal(route.selectedProviderId, 'muapi', '带 duration 的请求不能落到不支持 duration 的渠道');
  assert.ok(route.rejected.some((r) => String(r.reason).startsWith('PARAM_UNSUPPORTED')));
});

test('所有渠道都因并发满而拒绝时任务是排队，不是失败', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [{ provider: 'kling', endpoint: 'only-channel', baseCost: 0.01, concurrencyLimit: 1 }],
  });
  const userId = await seedUser();
  try {
    // 占用该网关唯一的并发位：另建一条任务并留一条未结束的尝试。
    const blocker = await createGenerationTask({ userId, modelId, prompt: '占位', idempotencyKey: `s2:block:${userId}` });
    await db.execute(`
      INSERT INTO ai_studio.generation_attempts
        (id, creation_id, attempt_number, provider_id, provider_model_id, status, started_at)
      VALUES ('s2att_block', $1, 1, 'kling', 'only-channel', 'processing', now())
    `, [blocker.creation.id]);

    const task = await createGenerationTask({ userId, modelId, prompt: '排队', idempotencyKey: `s2:defer:${userId}` });
    const result = await processGenerationTask({ creationId: task.creation.id, providerFactory: fakeFactory({}) });
    assert.deepEqual(outcomeOf(result), { deferred: true, status: 'queued' }, '并发满要把任务退回队列，不能判失败扣额度');
    const reservation = await db.queryOne('SELECT status FROM credit_reservations WHERE id = $1', [task.creation.reservation_id]);
    assert.equal(reservation.status, 'RESERVED', '排队让位既不结算也不释放');

    const attempts = await db.queryMany('SELECT id FROM ai_studio.generation_attempts WHERE creation_id = $1', [task.creation.id]);
    assert.equal(attempts.length, 0, '还没提交上游就不该留下尝试记录');
  } finally {
    await db.execute(`DELETE FROM ai_studio.generation_attempts WHERE id = 's2att_block'`).catch(() => {});
    await cleanupUser(userId);
  }
});

test('首个渠道超时后在同一标准模型内换渠道成功，且只正式扣除一次积分', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'kling-broken', baseCost: 0.001 },
      { provider: 'muapi', endpoint: 'muapi-works', baseCost: 0.004 },
    ],
    policy: { routing_mode: 'stability' },
  });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '故障转移', idempotencyKey: `s2:failover:${userId}` });
    const factory = fakeFactory({ failures: { kling: 'UPSTREAM_GENERATION_FAILED' } });
    const result = await processGenerationTask({ creationId: task.creation.id, providerFactory: factory });

    assert.deepEqual(outcomeOf(result), { success: true, status: 'succeeded' });
    assert.equal(result.creation.model, modelId, '故障转移只换渠道，绝不换模型');
    assert.equal(Number(result.creation.total_attempts), 2);
    assert.equal(result.creation.selected_provider_id, 'muapi');

    const attempts = await db.queryMany(
      'SELECT provider_id, status, error_code FROM ai_studio.generation_attempts WHERE creation_id = $1 ORDER BY attempt_number',
      [task.creation.id],
    );
    assert.deepEqual(attempts.map((a) => [a.provider_id, a.status]), [['kling', 'failed'], ['muapi', 'succeeded']]);
    assert.equal(attempts[0].error_code, 'UPSTREAM_GENERATION_FAILED');

    // 每次上游调用都留下路由决策与成本记录，失败的尝试不得记作用户已扣积分。
    const logs = await db.queryMany('SELECT selected_provider_id FROM ai_studio.route_decision_logs WHERE job_id = $1 ORDER BY created_at', [task.creation.id]);
    assert.deepEqual(logs.map((l) => l.selected_provider_id), ['kling', 'muapi']);
    const costs = await db.queryMany(
      'SELECT provider_id, credits_charged FROM ai_studio.provider_cost_records WHERE job_id = $1 ORDER BY created_at',
      [task.creation.id],
    );
    assert.equal(costs.length, 2);
    assert.equal(Number(costs.find((c) => c.provider_id === 'kling').credits_charged), 0);
    assert.equal(Number(costs.find((c) => c.provider_id === 'muapi').credits_charged), 5);

    // 凭据按网关各自取：kling 的调用不能带 muapi 的 key。
    assert.deepEqual(factory.calls.map((c) => [c.provider, c.action, c.apiKey]), [
      ['kling', 'submit', 'server-key-kling'],
      ['muapi', 'submit', 'server-key-muapi'],
    ]);

    // 金钱不变量：一次任务最多一次正式扣除。
    const commits = await db.queryMany(
      `SELECT id FROM credit_ledger_v2 WHERE user_id = $1 AND action_type = 'TASK_COMMIT'`,
      [userId],
    );
    assert.equal(commits.length, 1);
    const wallet = await db.queryOne('SELECT frozen_credits, perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    assert.equal(Number(wallet.frozen_credits), 0, '结算后不能残留冻结额度');
    assert.equal(Number(wallet.perpetual_credits), 45);
  } finally {
    await cleanupUser(userId);
  }
});

test('关闭故障转移后首选渠道失败就就地失败，不会换到下一家', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'kling-broken', baseCost: 0.001 },
      { provider: 'muapi', endpoint: 'muapi-works', baseCost: 0.004 },
    ],
    policy: { routing_mode: 'cost', failover_enabled: false },
  });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '关闭故障转移', idempotencyKey: `s2:nofailover:${userId}` });
    const factory = fakeFactory({ failures: { kling: 'UPSTREAM_GENERATION_FAILED' } });
    const result = await processGenerationTask({ creationId: task.creation.id, providerFactory: factory });

    assert.deepEqual(outcomeOf(result), { success: false, status: 'failed' });
    assert.equal(result.creation.error_code, 'UPSTREAM_GENERATION_FAILED', '失败原因必须是供应商错误，不是路由器的守卫错误');
    assert.equal(factory.calls.filter((c) => c.action === 'submit').length, 1, '后台关掉故障转移后不得偷偷换渠道重试');
    assert.equal(result.creation.selected_provider_id, 'kling');
    const attempts = await db.queryMany('SELECT provider_id FROM ai_studio.generation_attempts WHERE creation_id = $1', [task.creation.id]);
    assert.equal(attempts.length, 1);
    const reservation = await db.queryOne('SELECT status FROM credit_reservations WHERE id = $1', [task.creation.reservation_id]);
    assert.equal(reservation.status, 'VOIDED', '失败必须释放预扣');
  } finally {
    await cleanupUser(userId);
  }
});

test('路由器自身拒绝关闭故障转移后的换渠道重试', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'kling-a', baseCost: 0.001 },
      { provider: 'muapi', endpoint: 'muapi-b', baseCost: 0.004 },
    ],
    policy: { routing_mode: 'cost', failover_enabled: false },
  });

  const first = await routeGenerationTask({ modelId, parameters: {}, log: false });
  assert.equal(first.failoverEnabled, false, '策略开关必须随路由结果返回给生成链路');
  await assert.rejects(
    () => routeGenerationTask({ modelId, parameters: {}, excludedProviderIds: ['kling'], log: false }),
    (error) => error.code === 'FAILOVER_DISABLED',
    '排除首家就是故障转移，关闭时必须拒绝而不是换家',
  );
});

test('内容违规不触发换渠道，直接失败并释放额度', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [
      { provider: 'kling', endpoint: 'kling-a', baseCost: 0.001 },
      { provider: 'muapi', endpoint: 'muapi-b', baseCost: 0.004 },
    ],
    policy: { routing_mode: 'cost' },
  });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '违规内容', idempotencyKey: `s2:policy:${userId}` });
    const factory = fakeFactory({ failures: { kling: 'CONTENT_POLICY' } });
    const result = await processGenerationTask({ creationId: task.creation.id, providerFactory: factory });

    assert.deepEqual(outcomeOf(result), { success: false, status: 'failed' });
    assert.equal(result.creation.error_code, 'CONTENT_POLICY');
    assert.equal(factory.calls.filter((c) => c.action === 'submit').length, 1, '换一家也改不了内容策略结论，不得重复调用');
    const attempts = await db.queryMany('SELECT provider_id FROM ai_studio.generation_attempts WHERE creation_id = $1', [task.creation.id]);
    assert.equal(attempts.length, 1);
    const reservation = await db.queryOne('SELECT status FROM credit_reservations WHERE id = $1', [task.creation.reservation_id]);
    assert.equal(reservation.status, 'VOIDED', '失败必须释放预扣');
    // 内容违规是用户侧问题，不该把整条网关判熔断。
    const provider = await db.queryOne('SELECT circuit_state, consecutive_failures FROM ai_studio.ai_providers WHERE id = $1', ['kling']);
    assert.equal(provider.circuit_state, 'closed');
  } finally {
    await cleanupUser(userId);
  }
});

test('已提交的任务由轮询恢复推进，且不会重复向上游提交', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    channels: [{ provider: 'muapi', endpoint: 'muapi-async', baseCost: 0.01 }],
  });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '异步视频', idempotencyKey: `s2:async:${userId}` });
    // 第一次心跳只查到一个还在处理中的快照：任务必须留在 processing，
    // 而不是被单次 HTTP 超时作废后重新提交一次上游任务。
    const factory = fakeFactory({ submitted: 'async', pollsBeforeDone: 1 });
    const first = await processGenerationTask({ creationId: task.creation.id, providerFactory: factory });

    assert.deepEqual(outcomeOf(first), { pending: true, status: 'processing' }, '提交后没有结果就留在 processing，不占着 worker 干等');
    assert.equal(first.creation.provider_request_id, 's2_muapi');

    // 模拟 worker 重启后锁与轮询时间都已过期。
    await db.execute(`
      UPDATE creations SET next_poll_at = NOW() - INTERVAL '1 second', poll_locked_until = NULL WHERE id = $1
    `, [task.creation.id]);

    const resumed = await resumeGenerationTask({ creationId: task.creation.id, providerFactory: factory });
    assert.deepEqual(outcomeOf(resumed), { success: true, status: 'succeeded' }, `轮询调用记录: ${JSON.stringify(factory.calls)}`);
    assert.deepEqual(factory.calls.map((c) => c.action), ['submit', 'poll', 'poll']);
    const attempts = await db.queryMany('SELECT status FROM ai_studio.generation_attempts WHERE creation_id = $1', [task.creation.id]);
    assert.equal(attempts.length, 1, '恢复轮询是同一次尝试的延续，不是新尝试');
  } finally {
    await cleanupUser(userId);
  }
});
