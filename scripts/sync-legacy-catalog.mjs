import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  };
} catch {}

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const db = await import('../lib/db/index.js');
const { syncLegacyCatalog, getCatalogGaps } = await import('../lib/services/catalogSync.js');

// 默认干跑：先让人看清写的是哪个库、会补多少行，再显式 --apply。
// 这个脚本连的就是应用库，误跑的代价和对账本身一样，不该由一次 Tab 补全决定。
const apply = process.argv.includes('--apply');

try {
  const target = await db.queryOne('SELECT current_database() AS database, current_user AS usr');
  console.log(`[catalog:sync] 目标库 ${target?.database}（${target?.usr}）`);
  if (!apply) {
    console.log('[catalog:sync] 干跑模式，只报告缺口；确认后用 npm run catalog:sync -- --apply 写入');
    console.log(JSON.stringify(await getCatalogGaps(), null, 2));
    process.exitCode = 2;
  } else {
    // 本地 DATABASE_URL 经隧道就是生产库，写入这一支必须单独过生产库闸门。
    const { refuseProductionWrite } = await import('./require-sandbox-db.mjs');
    if (refuseProductionWrite(target?.database)) process.exit(1);
    console.log(JSON.stringify(await syncLegacyCatalog({}), null, 2));
  }
} catch (error) {
  console.error('[sync-legacy-catalog] failed:', error.message);
  process.exitCode = 1;
} finally {
  await db.closePgPool();
}
