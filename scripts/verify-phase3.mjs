import { runPostgresVerification } from './verify-postgres.mjs';

try {
  await runPostgresVerification();
} catch (error) {
  console.error('[verify] failed:', error.message);
  process.exitCode = 1;
}
