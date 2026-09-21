import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { getCatalogGapSummary } = await import('../../lib/repositories/legacyCatalog.js');
const { syncLegacyCatalog } = await import('../../lib/services/catalogSync.js');

if (testUrl) await migrations.runMigrations();

test.after(async () => {
  await db.closePgPool();
});

async function seedLegacyModel(id, overrides = {}) {
  const row = {
    provider: 'syncbrand',
    name: `Sync Probe ${id}`,
    type: 'lipsync',
    cost_usd: 0.25,
    credits_price: 7,
    is_active: true,
    sort_order: 500,
    metadata_json: { modes: ['t2v'], description: `desc-${id}` },
    ...overrides,
  };
  await db.execute(`
    INSERT INTO ai_studio.models_config
      (id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
  `, [id, row.provider, row.name, row.type, row.cost_usd, row.credits_price, row.is_active, row.sort_order, JSON.stringify(row.metadata_json)]);
}

async function cleanup(...ids) {
  for (const id of ids) {
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [id]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.models_config WHERE id = $1', [id]).catch(() => {});
  }
}

test('legacy catalog reconcile materialises model, muapi channel and routing policy', { skip: !testUrl }, async () => {
  const id = `db_sync_a_${Date.now().toString(36)}`;
  await seedLegacyModel(id);
  try {
    const result = await syncLegacyCatalog({});
    assert.ok(result.models >= 1, 'expected at least one canonical model to be inserted');
    assert.ok(result.channels >= 1);
    assert.ok(result.routingPolicies >= 1);
    assert.equal(result.pricingSynced, false);

    const model = await db.queryOne('SELECT * FROM ai_studio.ai_models WHERE id = $1', [id]);
    assert.ok(model, 'canonical model missing after sync');
    assert.equal(model.slug, id);
    assert.equal(model.category, 'video', 'lipsync must map onto an allowed canonical category');
    assert.equal(model.status, 'active');
    assert.equal(model.name, `Sync Probe ${id}`);
    assert.equal(model.description, `desc-${id}`);
    assert.equal(model.is_featured, false);

    const channel = await db.queryOne('SELECT * FROM ai_studio.provider_models WHERE model_id = $1', [id]);
    assert.ok(channel, 'muapi channel missing after sync');
    assert.equal(channel.provider_id, 'muapi');
    assert.equal(channel.provider_model_id, id, 'legacy endpoint id must survive as the provider model id');
    assert.equal(channel.enabled, true);
    assert.equal(Number(channel.cost_config.base_cost), 0.25);
    assert.equal(channel.cost_config.currency, 'USD');
    assert.equal(channel.metadata.legacy_brand, 'syncbrand');

    const policy = await db.queryOne('SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [id]);
    assert.ok(policy);
    assert.equal(policy.routing_mode, 'balanced');
    assert.equal(policy.failover_enabled, true);
  } finally {
    await cleanup(id);
  }
});

test('reconcile is idempotent and never rewrites an already synced model', { skip: !testUrl }, async () => {
  const id = `db_sync_b_${Date.now().toString(36)}`;
  await seedLegacyModel(id);
  const rowsFor = async () => ({
    models: (await db.queryMany('SELECT id FROM ai_studio.ai_models WHERE id = $1', [id])).length,
    channels: (await db.queryMany('SELECT id FROM ai_studio.provider_models WHERE model_id = $1', [id])).length,
    policies: (await db.queryMany('SELECT id FROM ai_studio.routing_policies WHERE model_id = $1', [id])).length,
  });
  try {
    await syncLegacyCatalog({});
    const before = await rowsFor();
    await syncLegacyCatalog({});
    await syncLegacyCatalog({});
    const after = await rowsFor();

    // 计数按单个模型断言：隔离库由多个测试文件并行共用，全站计数不是稳定基准。
    assert.deepEqual(after, before);
    assert.equal(after.models, 1);
    assert.equal(after.channels, 1);
    assert.equal(after.policies, 1);
  } finally {
    await cleanup(id);
  }
});

test('reconcile preserves operator edits to channels, routing and pricing', { skip: !testUrl }, async () => {
  const id = `db_sync_c_${Date.now().toString(36)}`;
  await seedLegacyModel(id);
  try {
    await syncLegacyCatalog({});
    await db.execute(`
      UPDATE ai_studio.provider_models
      SET priority = 42, enabled = FALSE, cost_config = '{"currency":"USD","base_cost":9.99}'::jsonb
      WHERE model_id = $1
    `, [id]);
    await db.execute(`
      UPDATE ai_studio.routing_policies
      SET routing_mode = 'cost', failover_enabled = FALSE
      WHERE model_id = $1
    `, [id]);
    await db.execute(`
      INSERT INTO ai_studio.model_pricing (id, model_id, pricing_type, base_credits, is_active)
      VALUES ($1, $2, 'fixed', 3, TRUE)
    `, [`prc_${id}`, id]);

    await syncLegacyCatalog({});
    await syncLegacyCatalog({});

    const channel = await db.queryOne('SELECT * FROM ai_studio.provider_models WHERE model_id = $1', [id]);
    assert.equal(channel.priority, 42);
    assert.equal(channel.enabled, false);
    assert.equal(Number(channel.cost_config.base_cost), 9.99);

    const policy = await db.queryOne('SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [id]);
    assert.equal(policy.routing_mode, 'cost');
    assert.equal(policy.failover_enabled, false);

    const pricing = await db.queryOne('SELECT base_credits FROM ai_studio.model_pricing WHERE model_id = $1', [id]);
    assert.equal(pricing.base_credits, 3);
  } finally {
    await cleanup(id);
  }
});

test('gateway channels are catalog data: only models the gateway can actually serve', { skip: !testUrl }, async () => {
  const stamp = Date.now().toString(36);
  const imageId = `seedream-5-0-${stamp}`;
  const videoId = `seedance-2-5-t2v-${stamp}`;
  await seedLegacyModel(imageId, { provider: 'bytedance', type: 'image', credits_price: 2 });
  await seedLegacyModel(videoId, { provider: 'bytedance', type: 'video', credits_price: 10 });
  try {
    const result = await syncLegacyCatalog({});
    assert.ok(result.directChannels >= 1);

    const provider = await db.queryOne('SELECT * FROM ai_studio.ai_providers WHERE id = $1', ['volcengine']);
    assert.ok(provider);
    assert.equal(provider.enabled, true);
    assert.match(provider.base_url, /ark/);

    const imageChannels = await db.queryMany(
      'SELECT provider_id, priority, provider_model_id FROM ai_studio.provider_models WHERE model_id = $1',
      [imageId],
    );
    assert.deepEqual(
      imageChannels.map((c) => c.provider_id).sort(),
      ['muapi', 'volcengine'],
      'an Ark-callable image model must be reachable both direct and via the aggregator',
    );
    const direct = imageChannels.find((c) => c.provider_id === 'volcengine');
    assert.equal(direct.priority, 110, 'the working direct gateway must win over the failing aggregator');
    assert.equal(direct.provider_model_id, imageId);

    const videoChannels = await db.queryMany(
      'SELECT provider_id FROM ai_studio.provider_models WHERE model_id = $1',
      [videoId],
    );
    assert.deepEqual(videoChannels.map((c) => c.provider_id), ['muapi'], 'Seedance video is not servable by the Ark image endpoint');
  } finally {
    await cleanup(imageId, videoId);
  }
});

test('inactive legacy models sync as disabled and the gap report reflects reality', { skip: !testUrl }, async () => {
  const id = `db_sync_d_${Date.now().toString(36)}`;
  const missing = `db_sync_e_${Date.now().toString(36)}`;
  const unpriced = `db_sync_f_${Date.now().toString(36)}`;
  await seedLegacyModel(missing, { is_active: false });
  // 「有标准模型但没有定价」这条缺口要自己造：全站计数不能指望别的并行文件留下残骸。
  await seedLegacyModel(unpriced);
  await db.execute(`
    INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category)
    VALUES ($1, $1, $1, 'Gap probe', 'image')
  `, [unpriced]);
  try {
    const before = await getCatalogGapSummary();
    assert.ok(before.legacy_without_model >= 1);
    assert.ok(before.model_without_pricing >= 1, 'pricing must remain an explicit gap, not a silent reprice');

    await syncLegacyCatalog({});
    const after = await (await import('../../lib/repositories/legacyCatalog.js')).getCatalogGapSummary();
    // 全站计数只断言方向：隔离库由多个测试文件并行共用，别的文件正在增删自己的探针模型。
    assert.ok(after.legacy_without_model < before.legacy_without_model);
    assert.ok(after.active_without_channel <= before.active_without_channel);
    assert.ok(Number.isFinite(after.model_without_channel));
    assert.ok(Number.isFinite(after.model_without_routing));
    assert.ok(Number.isFinite(after.legacy_pricing_mismatch), 'the pricing-scale conflict must be reported, not silently priced over');
    assert.ok(Number.isFinite(after.legacy_pricing_floor_above_current));

    const probePricing = await db.queryOne('SELECT 1 FROM ai_studio.model_pricing WHERE model_id = $1', [unpriced]);
    assert.equal(probePricing, null, '对账只补目录缺口，绝不替运营把价格落下去');

    const model = await db.queryOne('SELECT status FROM ai_studio.ai_models WHERE id = $1', [missing]);
    assert.equal(model.status, 'disabled');
    const channel = await db.queryOne('SELECT enabled FROM ai_studio.provider_models WHERE model_id = $1', [missing]);
    assert.equal(channel.enabled, false);
    const policy = await db.queryOne('SELECT routing_mode FROM ai_studio.routing_policies WHERE model_id = $1', [missing]);
    assert.equal(policy.routing_mode, 'balanced');

    await seedLegacyModel(id, { type: 'unknown-modality' });
    await syncLegacyCatalog({});
    const other = await db.queryOne('SELECT category FROM ai_studio.ai_models WHERE id = $1', [id]);
    assert.equal(other.category, 'other');
  } finally {
    await cleanup(id, missing, unpriced);
  }
});
