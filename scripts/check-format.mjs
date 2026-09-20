import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
const roots = ['app/', 'components/', 'lib/', 'packages/', 'scripts/', 'tests/'];
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.sql', '.yml', '.yaml']);
const MIGRATIONS_PREFIX = 'lib/db/migrations/';
const eol = (text) => text.replace(/\r\n/g, '\n');

// 已提交的迁移文件由 sys_core.schema_migrations 的 sha256 记账，字节一旦上线就不可改写：
// 仅补一个结尾换行也会立刻造成校验和漂移，把 /api/health 打成降级。
// 因此结尾 LF 只对新增或内容已变更的迁移强制生效。
function committedMigrationUnchanged(name, workingContent) {
  if (!name.startsWith(MIGRATIONS_PREFIX)) return false;
  const head = spawnSync('git', ['show', `HEAD:${name}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return head.status === 0 && eol(head.stdout) === eol(workingContent);
}

const issues = [];
for (const name of result.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!roots.some((root) => name.startsWith(root)) || !extensions.has(path.extname(name))) continue;
  // `git ls-files -c` includes index entries deleted in the working tree;
  // formatting checks must not try to read legacy files that were intentionally
  // removed during a route migration.
  if (!fs.existsSync(name)) continue;
  const content = fs.readFileSync(name, 'utf8');
  if (content.includes('\u0000')) issues.push(`${name}: contains NUL byte`);
  // Git labels both ends of a conflict, so match only `<<<<<<<`/`>>>>>>>`; a bare
  // `===` run is a common text divider (e.g. generated receipts) and misfires.
  if (/^(?:<{7}|>{7})(?:\s|$)/m.test(content)) issues.push(`${name}: contains merge-conflict markers`);
  if (!content.endsWith('\n') && !committedMigrationUnchanged(name, content)) issues.push(`${name}: must end with LF`);
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('format policy check passed');
}
