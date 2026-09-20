import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
const roots = ['app/', 'components/', 'lib/', 'packages/', 'scripts/', 'tests/'];
const extensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.sql', '.yml', '.yaml']);
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
  if (!content.endsWith('\n')) issues.push(`${name}: must end with LF`);
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('format policy check passed');
}
