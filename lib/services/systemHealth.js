import { healthCheck, nowIso } from '../db/index.js';
import { getMigrationStatus } from '../db/migrations.js';
import { getProvidersOverview } from './providers.js';

export async function getSystemHealth() {
  const [database, migrations, providers] = await Promise.all([healthCheck(), getMigrationStatus(), getProvidersOverview()]);
  return { database, migrations, providers, checkedAt: nowIso() };
}
