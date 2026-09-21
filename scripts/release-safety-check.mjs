import fs from 'node:fs/promises';
import path from 'node:path';

const forbiddenRuntime = [
  /node:sqlite/,
  /DatabaseSync/,
  /BILLING_DB_PATH/,
  /process\.env\.DATABASE_URL\s*\|\|\s*['"`]postgres(?:ql)?:\/\//,
  /process\.env\.DATABASE_URL\s*=\s*process\.env\.DATABASE_URL\s*\|\|/,
];
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', 'release', 'data'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
for (const root of ['app', 'components', 'lib', 'packages', 'scripts']) {
  await walk(path.join(process.cwd(), root));
}
const violations = [];
for (const file of files) {
  if (path.resolve(file) === path.resolve(process.argv[1])) continue;
  const source = await fs.readFile(file, 'utf8');
  for (const pattern of forbiddenRuntime) if (pattern.test(source)) violations.push(`${path.relative(process.cwd(), file)} matches ${pattern}`);
}
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log(`release safety check passed for ${files.length} source files`);
