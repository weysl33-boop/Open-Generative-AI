import { healthCheck, nowIso } from '../db/index.js';
import { getMigrationStatus } from '../db/migrations.js';
import { getProvidersOverview } from './providers.js';

export async function getSystemHealth() {
  const [database, migrations, providers] = await Promise.all([
    healthCheck().catch((error) => ({ ok: false, latencyMs: null, pool: { total: 0, idle: 0, waiting: 0, max: 0 }, database: null, user: null, error: error.code || 'DATABASE_UNAVAILABLE' })),
    getMigrationStatus().catch((error) => ({ ok: false, applied: [], pending: [], drifted: [], latest: null, error: error.code || 'MIGRATION_STATUS_UNAVAILABLE' })),
    getProvidersOverview().catch((error) => [{ id: 'system', name: '外部依赖', description: '健康检查暂时不可用', configured: false, status: 'unknown', error: error.code || 'PROVIDER_STATUS_UNAVAILABLE' }]),
  ]);
  return { database, migrations, providers, checkedAt: nowIso() };
}

export async function getReadiness() {
  try {
    const [database, migrations] = await Promise.all([healthCheck(), getMigrationStatus()]);
    return {
      ready: Boolean(database.ok && migrations.ok),
      database: { ok: Boolean(database.ok) },
      migrations: { ok: Boolean(migrations.ok) },
    };
  } catch {
    return { ready: false, database: { ok: false }, migrations: { ok: false } };
  }
}
