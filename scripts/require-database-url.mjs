const value = String(process.env.DATABASE_URL || '').trim();

if (!value) {
  console.error('[startup] DATABASE_URL is required; PostgreSQL 16 is the only supported database.');
  process.exit(1);
}

try {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('scheme');
} catch {
  console.error('[startup] DATABASE_URL must be a valid postgres:// or postgresql:// URL.');
  process.exit(1);
}

console.log('[startup] PostgreSQL connection configuration present.');
