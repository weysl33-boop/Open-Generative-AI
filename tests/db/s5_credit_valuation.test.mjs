import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { BUILT_IN_CREDIT_VALUATION } = await import('../../lib/financial/creditValuation.js');
const { getModelCenterSnapshot } = await import('../../lib/services/models.js');

if (testUrl) await migrations.runMigrations();

const modelId = `s5_valuation_${Date.now().toString(36)}`;

async function setValuation(value) {
  await db.execute(
    `INSERT INTO system_settings (key, value_json, visibility, updated_by)
     VALUES ('credit_valuation', $1::jsonb, 'private', 's5-test')
     ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = now()`,
    [JSON.stringify(value)]
  );
}

async function clearValuation() {
  await db.execute(`DELETE FROM system_settings WHERE key = 'credit_valuation'`);
}

async function snapshotOf(id) {
  const snapshot = await getModelCenterSnapshot();
  return { snapshot, model: snapshot.models.find((item) => item.id === id) || null };
}

test('Credits 估值来自系统设置：改一个数字，模型中心的美元售价与来源标注同时跟着变', { skip: !testUrl }, async () => {
  await clearValuation();
  await db.execute(
    `INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, status)
     VALUES ($1, $1, 'S5 估值模型', 'S5 估值模型', 'image', 'active')`,
    [modelId]
  );
  await db.execute(
    `INSERT INTO models_config (id, provider, name, type, credits_price, cost_usd, is_active)
     VALUES ($1, 'muapi', 'S5 估值模型', 'image', 5, 0.02, TRUE)`,
    [modelId]
  );

  try {
    const fallback = await snapshotOf(modelId);
    assert.equal(fallback.snapshot.creditValuation.source, 'default');
    assert.equal(fallback.snapshot.creditUsdRate, BUILT_IN_CREDIT_VALUATION.usdPerCredit);
    assert.equal(fallback.model.credits, 5);
    assert.equal(fallback.model.userPriceUsd, 0.05, '未配置时按内置口径折算');

    await setValuation({ usdPerCredit: 0.02 });
    const configured = await snapshotOf(modelId);
    assert.equal(configured.snapshot.creditValuation.source, 'setting');
    assert.equal(configured.snapshot.creditUsdRate, 0.02, '快照必须用设置里的口径，不是内置常量');
    assert.equal(configured.model.userPriceUsd, 0.1);
    assert.equal(configured.model.marginRate, 80, '毛利率也必须跟着新口径重算');

    await setValuation({ usdPerCredit: 'abc' });
    const broken = await snapshotOf(modelId);
    assert.equal(broken.snapshot.creditValuation.source, 'invalid');
    assert.equal(
      broken.snapshot.creditUsdRate,
      BUILT_IN_CREDIT_VALUATION.usdPerCredit,
      '非法估值整份退回内置值，不能拿 NaN 去乘价格'
    );
    assert.equal(broken.model.userPriceUsd, 0.05);
  } finally {
    await clearValuation();
    await db.execute(`DELETE FROM models_config WHERE id = $1`, [modelId]);
    await db.execute(`DELETE FROM ai_studio.ai_models WHERE id = $1`, [modelId]);
  }
});
