// CLI + in-script entry point for the production-write policy in
// lib/db/write-policy.js. `lib/db` refuses writes on its own; this module is the
// explicit, earlier check that maintenance scripts call so the operator sees the
// target database before anything runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isProductionDatabaseName,
  productionWriteAcknowledged,
  refuseProductionWrite,
} from '../lib/db/write-policy.js';

export {
  isProductionDatabaseName,
  productionWriteAcknowledged,
  refuseProductionWrite,
};

export function readEnvValue(name) {
  const fromProcess = String(process.env[name] || '').trim();
  if (fromProcess) return fromProcess;
  try {
    const env = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
    const line = new RegExp(`^${name}=(.*)$`, 'm').exec(env)?.[1];
    return String(line || '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

// Verify the *connected* database name rather than parsing the URL, because a
// 127.0.0.1 tunnel can land on the production cluster.
export async function assertSandboxDatabase(options = {}) {
  const { Client } = await import('pg');
  const connectionString = options.connectionString || readEnvValue('DATABASE_URL');
  if (!connectionString) {
    throw new Error('[db-guard] DATABASE_URL is missing, so the target database cannot be verified.');
  }
  const client = new Client({ connectionString, statement_timeout: 10_000, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const { rows } = await client.query('select current_database() as db');
    const databaseName = rows[0]?.db || '';
    if (options.report !== false) {
      const url = new URL(connectionString);
      console.log(`[db-guard] current_database=${databaseName} (target ${url.hostname}:${url.port || 5432})`);
    }
    if (refuseProductionWrite(databaseName)) {
      throw new Error(`[db-guard] Refusing to write to the live site's "${databaseName}" database.`);
    }
    return databaseName;
  } catch (error) {
    if (String(error?.message || '').startsWith('[db-guard]')) throw error;
    // Fail closed: an unverifiable target is treated as production.
    throw new Error(
      `[db-guard] Cannot verify the target database (${String(error?.code || error?.name || 'ERROR')}), so refusing to continue.`,
      { cause: error },
    );
  } finally {
    await client.end().catch(() => {});
  }
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    await assertSandboxDatabase();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
