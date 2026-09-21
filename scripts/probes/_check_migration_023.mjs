// 一次性核对 023 的 SQL：在全新隔离库里先补齐 models_config，再执行迁移语句本身，
// 确认它会给 Seedream 图像模型建出 volcengine 渠道、并且重复执行不产生第二条。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const p = require.resolve('server-only'); require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const { Client } = await import('pg');

// 只允许在测试服务器上开临时库：缺 TEST_DATABASE_URL 直接退出，绝不回落到应用库连接串。
const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (!testUrl) {
  console.error('TEST_DATABASE_URL is required; refusing to create scratch databases on the application server.');
  process.exit(1);
}
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';
const name = `chk023_${crypto.randomBytes(4).toString('hex')}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;
// 关键：lib/db 的连接池读的是 DATABASE_URL，不指到临时库就会写进应用库。
process.env.DATABASE_URL = url.toString();

// lib/db/migrations.js 读文件时去 BOM，这里保持同一口径。
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();

const db = new Client({ connectionString: url.toString() });
await db.connect();
try {
  const dir = path.resolve('lib/db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const read = (file) => stripBom(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const file of files) {
    if (file.startsWith('023')) continue;
    try {
      await db.query(read(file));
    } catch (error) {
      console.error('failed to apply', file, error.message);
      throw error;
    }
  }
  console.log('migrations applied:', files.length - 1, '(023 held back)');

  await db.query(`
    INSERT INTO ai_studio.models_config (id, provider, name, type, cost_usd, credits_price, is_active, metadata_json)
    VALUES
      ('seedream-5.0','bytedance','Seedream 5.0','image',0,2,TRUE,'{}'),
      ('seedream-5.0-edit','bytedance','Seedream 5.0 Edit','image',0,2,TRUE,'{}'),
      ('seedance-2.5-text-to-video','bytedance','Seedance 2.5','video',0,10,TRUE,'{}'),
      ('seedance-2-character','bytedance','Seedance 2 Character','image',0,2,TRUE,'{}')
  `);

  const sqlFile = files.find((f) => f.startsWith('023'));
  const sql = read(sqlFile);
  await db.query(sql);
  await db.query(sql);

  const providers = await db.query("SELECT id, provider_type, base_url, enabled FROM ai_studio.ai_providers WHERE id = 'volcengine'");
  console.log('provider:', JSON.stringify(providers.rows[0]));
  const channels = await db.query("SELECT model_id, provider_id, provider_model_id, priority FROM ai_studio.provider_models WHERE provider_id = 'volcengine' ORDER BY model_id");
  console.log('volcengine channels:', JSON.stringify(channels.rows));
  const models = await db.query("SELECT id, category, status FROM ai_studio.ai_models WHERE id LIKE 'seedream%' ORDER BY id");
  console.log('canonical seedream models:', JSON.stringify(models.rows));

  // 再走一遍后台对账，确认迁移与 reconciler 不会互相造出第二条渠道。
  const { withTransaction } = await import('../../lib/db/index.js');
  const legacyRepo = await import('../../lib/repositories/legacyCatalog.js');
  const reconciled = await withTransaction(async (tx) => ({
    providers: await legacyRepo.syncGatewayProviders(tx),
    models: await legacyRepo.syncCanonicalModelsFromLegacy(tx),
    channels: await legacyRepo.syncProviderChannelsFromLegacy(tx),
    direct: await legacyRepo.syncDirectProviderChannels(tx),
    policies: await legacyRepo.syncRoutingPolicies(tx),
  }));
  console.log('reconcile after migration:', JSON.stringify(reconciled));

  const dupes = await db.query(`
    SELECT model_id, provider_id, count(*)::int AS n FROM ai_studio.provider_models
    WHERE provider_id = 'volcengine' GROUP BY 1,2 HAVING count(*) > 1
  `);
  console.log('duplicate volcengine channels:', dupes.rowCount);
} finally {
  await db.end();
  const cleanup = new Client({ connectionString: adminUrl.toString() });
  await cleanup.connect();
  await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await cleanup.end();
  console.log('scratch database dropped');
}
