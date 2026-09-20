// Single source of truth for "may this process write to that database?".
//
// Why this exists as a module rather than as per-script checks: `DATABASE_URL` in
// this repo resolves to 127.0.0.1:5432 through a tunnel that lands on the
// *production* PostgreSQL cluster, so an ad-hoc Node script and the live app
// share one database. A forgotten `process.env.DATABASE_URL` overwrite in a
// one-off script therefore writes straight into prod — it already happened once
// during a catalog reconciliation. The name-based check below is what stops a
// script author's optimism from being the only line of defence.

const PRODUCTION_DATABASES = new Set(['koyosim_ai']);

// Maintenance scripts and long-running services both start as `node <path>`;
// only the Next server is exempt by shape, because it hosts the write path of
// real product routes. On the live host the app starts as `next start` from
// node_modules/.bin, and the running process renames itself to
// `next-server (vX)`, so both shapes are checked.
const SERVER_ENTRY_PATTERNS = [
  /next[/\\]dist[/\\]bin/i,
  /next[/\\]dist[/\\]server/i,
  /\.bin[/\\]next(?:\.cmd|\.ps1|\.exe)?$/i,
  /(^|[/\\])\.next([/\\]|$)/i,
];

export function isProductionDatabaseName(name) {
  return PRODUCTION_DATABASES.has(String(name || '').trim().toLowerCase());
}

export function productionDatabaseNames() {
  return [...PRODUCTION_DATABASES];
}

// Deliberately two flags: one says "I know this writes to prod", the other
// repeats the database name, so a stale shell environment cannot arm both.
export function productionWriteAcknowledged(databaseName) {
  return process.env.ALLOW_PRODUCTION_DB_WRITES === '1'
    && String(process.env.PRODUCTION_DB_ACK || '').trim() === String(databaseName || '').trim();
}

export function databaseNameFromUrl(connectionString) {
  try {
    return decodeURIComponent(new URL(String(connectionString)).pathname.replace(/^\/+/, '')).trim().toLowerCase();
  } catch {
    return '';
  }
}

export function overrideHint(databaseName) {
  return 'Point DATABASE_URL at a sandbox database, or set BOTH\n'
    + `           ALLOW_PRODUCTION_DB_WRITES=1 and PRODUCTION_DB_ACK=${databaseName} to override deliberately.`;
}

export function refuseProductionWrite(databaseName) {
  if (!isProductionDatabaseName(databaseName)) return false;
  if (productionWriteAcknowledged(databaseName)) {
    console.error(`[db-guard] PROCEEDING AGAINST PRODUCTION DATABASE "${databaseName}" — ALLOW_PRODUCTION_DB_WRITES=1 and PRODUCTION_DB_ACK are both set.`);
    return false;
  }
  console.error(
    `[db-guard] Refusing to continue: the target database is the live site's "${databaseName}".\n           ${overrideHint(databaseName)}`,
  );
  return true;
}

// True when this process must pass the production-database check before writing.
// Checked before any connection is opened, and it must stay side-effect free.
// Entry points that are genuinely long-running services declare themselves with
// `KOYOSIM_RUNTIME=service`; see scripts/generation-worker.mjs.
export function writeGuardApplies(entryPoint = process.argv[1], { title = process.title } = {}) {
  if (String(process.env.KOYOSIM_DB_WRITE_GUARD || '').trim().toLowerCase() === 'off') return false;
  if (String(process.env.KOYOSIM_RUNTIME || '').trim().toLowerCase() === 'service') return false;
  // Next renames its own server process; that is the strongest signal available
  // at runtime, because the entry path depends on how npm resolved the bin.
  // (Windows cannot set a title, so the entry patterns above carry that case.)
  if (/^next-server\b/i.test(String(title || ''))) return false;
  if (productionWriteAcknowledged(databaseNameFromUrl(process.env.DATABASE_URL))) return false;
  const entry = String(entryPoint || '');
  if (!entry) return true;
  if (SERVER_ENTRY_PATTERNS.some((pattern) => pattern.test(entry))) return false;
  return true;
}

const WRITE_KEYWORD = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|merge|vacuum|reindex|comment\s+on)\b/i;

// Conservative statement classifier: a false positive only costs an extra
// `current_database()` lookup, a false negative lets a write through.
export function looksLikeWriteSql(sqlText) {
  const sql = String(sqlText || '')
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\bfor\s+(no\s+key\s+)?update\b/gi, ' ');
  return WRITE_KEYWORD.test(sql);
}
