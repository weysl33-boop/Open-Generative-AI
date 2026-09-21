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
const { createGenerationTask } = await import('../../lib/services/generationCore.js');
const quoteService = await import('../../lib/services/generationQuote.js');
const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');

if (testUrl) await migrations.runMigrations();

const originalSource = process.env.GENERATION_QUOTE_SOURCE;
const stamp = Date.now().toString(36);
const touched = new Set();
let seq = 0;

test.after(async () => {
  if (originalSource === undefined) delete process.env.GENERATION_QUOTE_SOURCE;
  else process.env.GENERATION_QUOTE_SOURCE = originalSource;
  if (testUrl) {
    for (const modelId of touched) {
      await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
      await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
    }
  }
  await db.closePgPool();
});

/** 只播目录与价格，不播渠道：本文件只管「扣多少」，不管「谁来跑」。 */
async function seedModel({ creditsPrice = 5, catalogPricing = null, synced = true } = {}) {
  const modelId = `s3m_${stamp}_${(seq += 1)}`;
  touched.add(modelId);
  if (synced) {
    await db.execute(`
      INSERT INTO ai_studio.ai_models (id, slug, name, display_name, category, status)
      VALUES ($1, $1, $1, 'S3 报价模型', 'image', 'active')
    `, [modelId]);
  }
  await db.execute(`
    INSERT INTO models_config (id, provider, name, type, credits_price, cost_usd, is_active)
    VALUES ($1, 'muapi', 'S3 报价模型', 'image', $2, 0.01, TRUE)
  `, [modelId, creditsPrice]);
  if (catalogPricing) await catalog.upsertModelPricing({ model_id: modelId, ...catalogPricing });
  return modelId;
}

async function seedUser(credits = 5000) {
  const userId = `s3_user_${stamp}_${(seq += 1)}`;
  await db.execute(`
    INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
    VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')
  `, [userId, `${userId}@example.test`]);
  await grantPerpetualCredits(userId, credits, 'S3 报价测试额度', userId, `s3:seed:${userId}`);
  return userId;
}

async function cleanupUser(userId) {
  await db.execute('DELETE FROM credit_reservations WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM creations WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
}

async function quoteRow(quoteId) {
  return db.queryOne('SELECT * FROM ai_studio.generation_quotes WHERE id = $1', [quoteId]);
}

async function wallet(userId) {
  return db.queryOne('SELECT frozen_credits, perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
}

function parityCredits(quote) {
  return JSON.parse(typeof quote.pricing_breakdown_json === 'string'
    ? quote.pricing_breakdown_json
    : JSON.stringify(quote.pricing_breakdown_json)).quoteSource;
}

test('报价数额就是预扣数额：服务器报价、任务扣费与冻结额度三者一致', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 7 });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '报价一致性', idempotencyKey: `s3:basic:${userId}` });

    assert.ok(task.creation.quote_id, '扣费任务必须留下一张可追溯的报价单');
    const quote = await quoteRow(task.creation.quote_id);
    assert.equal(Number(quote.credits_quoted), 7);
    assert.equal(Number(task.creation.credit_cost), 7);
    assert.equal(parityCredits(quote), 'parity', '默认刻度仍是线上实收刻度');
    assert.ok(quote.consumed_at, '任务创建即视为报价已消费');

    const balance = await wallet(userId);
    assert.equal(Number(balance.frozen_credits), 7, '冻结的正是报价');
    assert.equal(Number(balance.perpetual_credits), 4993);
  } finally {
    await cleanupUser(userId);
  }
});

test('请求体里的积分字段不参与取价', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 9 });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({
      userId,
      modelId,
      prompt: '伪造价格',
      parameters: { credits: 1, credit_cost: 0, creditPrice: 0 },
      idempotencyKey: `s3:forge:${userId}`,
    });
    assert.equal(Number(task.creation.credit_cost), 9, '客户端写多少积分都不作数');
    assert.equal(Number((await quoteRow(task.creation.quote_id)).credits_quoted), 9);
    assert.equal(Number((await wallet(userId)).frozen_credits), 9);
  } finally {
    await cleanupUser(userId);
  }
});

test('预飞报价与实扣同源，带回 quote_id 时核销同一张票据而不是再开一张', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 5 });
  const userId = await seedUser();
  try {
    const prepared = await quoteService.createGenerationQuote({ userId, modelId, parameters: { resolution: '1024x1024' } });
    assert.equal(prepared.credits, 5, '报价接口与任务创建读同一处价格');
    assert.ok(prepared.quoteId);
    assert.equal((await quoteRow(prepared.quoteId)).consumed_at, null, '预飞票据在核销前不能是已消费');

    const task = await createGenerationTask({
      userId,
      modelId,
      prompt: '带票下单',
      idempotencyKey: `s3:prepared:${userId}`,
      preparedQuoteId: prepared.quoteId,
    });
    assert.equal(task.creation.quote_id, prepared.quoteId);
    const stored = await quoteRow(prepared.quoteId);
    assert.ok(stored.consumed_at, '核销后不留可复用票据');
    const rows = await db.queryMany('SELECT id FROM ai_studio.generation_quotes WHERE user_id = $1', [userId]);
    assert.equal(rows.length, 1, '一张票据走完下单，不该又补开一张');
  } finally {
    await cleanupUser(userId);
  }
});

test('票据被抢跑、被他人使用或价格已变都不成交，且不留预扣', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 5 });
  const userId = await seedUser();
  const otherUserId = await seedUser();
  try {
    const prepared = await quoteService.createGenerationQuote({ userId, modelId, parameters: {} });

    await assert.rejects(
      () => quoteService.consumePreparedQuote({
        quoteId: prepared.quoteId, userId: otherUserId, modelId, credits: 5,
      }),
      (error) => error.code === 'QUOTE_USER_MISMATCH',
      '票据不能替别人下单',
    );

    const consumed = await createGenerationTask({
      userId, modelId, prompt: '首次下单', idempotencyKey: `s3:reuse:a:${userId}`, preparedQuoteId: prepared.quoteId,
    });
    assert.ok(consumed.creation.quote_id);

    await assert.rejects(
      () => createGenerationTask({
        userId, modelId, prompt: '重放票据', idempotencyKey: `s3:reuse:b:${userId}`, preparedQuoteId: prepared.quoteId,
      }),
      (error) => error.code === 'QUOTE_ALREADY_CONSUMED',
    );

    await db.execute('UPDATE models_config SET credits_price = 12 WHERE id = $1', [modelId]);
    await assert.rejects(
      () => createGenerationTask({
        userId, modelId, prompt: '过期价', idempotencyKey: `s3:stale:${userId}`, preparedQuoteId: prepared.quoteId,
      }),
      (error) => error.code === 'QUOTE_ALREADY_CONSUMED',
      '已消费的票据先于价格变更被拒',
    );

    const fresh = await quoteService.createGenerationQuote({ userId, modelId, parameters: {} });
    assert.equal(fresh.credits, 12, '重新取票才拿到新价');
    await db.execute('UPDATE models_config SET credits_price = 5 WHERE id = $1', [modelId]);
    await assert.rejects(
      () => createGenerationTask({
        userId, modelId, prompt: '价格已变', idempotencyKey: `s3:changed:${userId}`, preparedQuoteId: fresh.quoteId,
      }),
      (error) => error.code === 'QUOTE_STALE',
      '目录价变了就让用户重新取票，不能显示旧价扣新价',
    );

    const rejected = await db.queryMany(
      'SELECT id FROM creations WHERE user_id = $1 AND id <> $2',
      [userId, consumed.creation.id],
    );
    assert.equal(rejected.length, 0, '被拒的下单不留任务行');
    assert.equal(Number((await wallet(userId)).frozen_credits), 5, '被拒的下单不留冻结额度');
  } finally {
    await cleanupUser(userId);
    await cleanupUser(otherUserId);
  }
});

test('切到目录刻度后才按 model_pricing 报价，未对账的模型直接拒绝而不是错扣', { skip: !testUrl }, async () => {
  const modelId = await seedModel({
    creditsPrice: 5,
    catalogPricing: { pricing_type: 'fixed', base_credits: 1800, min_credits: 1000 },
  });
  const userId = await seedUser();
  process.env.GENERATION_QUOTE_SOURCE = 'catalog';
  try {
    const quote = await quoteService.resolveGenerationQuote({ modelId, userId, parameters: {} });
    assert.equal(quote.credits, 1800, '目录刻度下按 model_pricing 报价');
    assert.equal(quote.source, 'catalog');

    const task = await createGenerationTask({ userId, modelId, prompt: '目录刻度', idempotencyKey: `s3:catalog:${userId}` });
    assert.equal(Number(task.creation.credit_cost), 1800);
    assert.equal(parityCredits(await quoteRow(task.creation.quote_id)), 'catalog');

    const unsynced = await seedModel({ creditsPrice: 3, synced: false });
    await assert.rejects(
      () => quoteService.resolveGenerationQuote({ modelId: unsynced, userId, parameters: {} }),
      (error) => error.code === 'MODEL_NOT_SYNCED',
      '目录缺口不能靠猜价格蒙过去',
    );
  } finally {
    delete process.env.GENERATION_QUOTE_SOURCE;
    await cleanupUser(userId);
  }
});

test('目录缺口下的默认刻度仍能下单：报价票据跳过但不拖累生成', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 4, synced: false });
  const userId = await seedUser();
  try {
    const task = await createGenerationTask({ userId, modelId, prompt: '未对账模型', idempotencyKey: `s3:gap:${userId}` });
    assert.equal(Number(task.creation.credit_cost), 4, '实扣数额照常按老目录价格');
    assert.equal(task.creation.quote_id, null, '外键落不下的票据宁缺勿假');
    assert.equal(Number((await wallet(userId)).frozen_credits), 4);
  } finally {
    await cleanupUser(userId);
  }
});

test('幂等重放不产生第二张票据', { skip: !testUrl }, async () => {
  const modelId = await seedModel({ creditsPrice: 6 });
  const userId = await seedUser();
  try {
    const first = await createGenerationTask({ userId, modelId, prompt: '重放', idempotencyKey: `s3:idem:${userId}` });
    const second = await createGenerationTask({ userId, modelId, prompt: '重放', idempotencyKey: `s3:idem:${userId}` });
    assert.equal(second.idempotent, true);
    assert.equal(second.creation.id, first.creation.id);
    const rows = await db.queryMany(
      'SELECT id FROM ai_studio.generation_quotes WHERE user_id = $1 AND model_id = $2',
      [userId, modelId],
    );
    assert.equal(rows.length, 1);
    assert.equal(Number((await wallet(userId)).frozen_credits), 6, '重放不能再冻结一次');
  } finally {
    await cleanupUser(userId);
  }
});
