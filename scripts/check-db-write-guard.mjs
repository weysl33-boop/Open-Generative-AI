// Gate: every script that can write to the database must state which database it
// is pointing at.
//
// `DATABASE_URL` in this repo resolves to 127.0.0.1:5432 through a tunnel that
// lands on the *production* PostgreSQL cluster, so a maintenance script and the
// live site share one database. `lib/db/pg.js` now refuses writes on its own
// (see lib/db/write-policy.js); this scan keeps the *source* honest as well, so
// a new script cannot reach prod through raw `pg`, and an allowlisted read-only
// probe cannot quietly grow a write.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { looksLikeWriteSql } from '../lib/db/write-policy.js';

// Resident services that legitimately own the live queues. They are exempt from
// the sandbox rule only because they declare themselves as services; rule 3
// below makes that declaration impossible to copy silently.
const SERVICE_ENTRIES = new Set([
  'scripts/generation-worker.mjs',
  'scripts/export-worker.mjs',
]);

// Read-only probes: no guard needed, but each is re-checked for write-shaped SQL
// on every run, so the list cannot rot into a write path.
const READ_ONLY_PROBES = new Set([
  'scripts/audit-branding-routes.mjs',
  'scripts/check-history.mjs',
  'scripts/db-status.mjs',
  'scripts/diagnose-provider-issue.mjs',
  'scripts/probes/_probe_adapters.mjs',
  'scripts/test-content-management.mjs',
]);

// The guard modules themselves open their own `pg` connection to look at
// `current_database()`; that read is the mechanism, not a bypass.
const GUARD_MODULES = new Set([
  'scripts/require-sandbox-db.mjs',
  'scripts/test-database-guard.mjs',
  'scripts/check-db-write-guard.mjs',
]);

const DB_REACHING = /(?:from|import)\s*\(?\s*['"][^'"]*lib\/(?:db|repositories|services|financial)[^'"]*['"]|(?:from|require)\s*\(?\s*['"]pg['"]/;
const GUARD_REFERENCE = /require-sandbox-db|test-database-guard/;
// Scratch-database protocol used by one-off drills: refuse to run without
// TEST_DATABASE_URL, then point DATABASE_URL at a throwaway database derived
// from it. lib/db then only ever sees the scratch target.
const SCRATCH_PROTOCOL = /TEST_DATABASE_URL[\s\S]{0,600}process\.env\.DATABASE_URL\s*=/;
const SERVICE_DECLARATION = /process\.env\.KOYOSIM_RUNTIME\s*=\s*['"]service['"]/;
const POOL_BYPASS = /getPgPool\s*\(\s*\)/;

function relativePath(file, cwd) {
  return path.relative(cwd, file).split(path.sep).join('/');
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

function collectScripts(root, cwd) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
        stack.push(full);
      } else if (/\.(?:mjs|cjs|js)$/.test(entry.name)) {
        out.push(relativePath(full, cwd));
      }
    }
  }
  return out.sort();
}

export function scanDbWriteGuards(roots = ['scripts'], cwd = process.cwd()) {
  const problems = [];
  const files = new Set();
  for (const root of roots) {
    const absolute = path.resolve(cwd, root);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      for (const file of collectScripts(absolute, cwd)) files.add(file);
    } else if (fs.existsSync(absolute)) {
      files.add(relativePath(absolute, cwd));
    }
  }

  for (const file of files) {
    const text = fs.readFileSync(path.resolve(cwd, file), 'utf8');
    if (GUARD_MODULES.has(file)) continue;
    const declaresService = SERVICE_DECLARATION.test(text);
    if (declaresService && !SERVICE_ENTRIES.has(file)) {
      problems.push(`${file}: declares KOYOSIM_RUNTIME=service but is not a listed resident service`);
    }
    if (POOL_BYPASS.test(text)) {
      problems.push(`${file}: takes a raw connection pool from lib/db, which bypasses the write guard`);
    }
    if (!DB_REACHING.test(text)) continue;
    if (GUARD_REFERENCE.test(text) || SCRATCH_PROTOCOL.test(text)) continue;
    if (SERVICE_ENTRIES.has(file)) {
      if (!declaresService) {
        problems.push(`${file}: reaches the database without declaring KOYOSIM_RUNTIME=service`);
      }
      continue;
    }
    if (READ_ONLY_PROBES.has(file)) {
      if (looksLikeWriteSql(stripComments(text))) {
        problems.push(`${file}: listed as a read-only probe but now contains write SQL`);
      }
      continue;
    }
    problems.push(`${file}: reaches the database without a production-write guard (import ./require-sandbox-db.mjs and await assertSandboxDatabase(), or list it deliberately)`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = scanDbWriteGuards();
  if (!problems.length) {
    console.log('[db-write-guard] OK — every database-reaching script states its write policy');
    process.exitCode = 0;
  } else {
    console.error(`[db-write-guard] ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  }
}
