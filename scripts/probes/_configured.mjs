import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const p = require.resolve('server-only'); require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const { Client } = await import('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const cols = await db.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='ai_studio' AND table_name IN ('provider_secrets','provider_configs') ORDER BY table_name, ordinal_position`);
console.log(cols.rows.map(r => `${r.table_name}.${r.column_name}`).join('\n'));
for (const t of ['provider_secrets','provider_configs']) {
  const r = await db.query(`SELECT * FROM ai_studio.${t} ORDER BY 1`);
  console.log(`\n=== ${t} (${r.rowCount}) ===`);
  for (const row of r.rows) console.log(JSON.stringify(row).slice(0, 220));
}
await db.end();
