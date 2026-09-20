import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
const ignored = new Set(['.env.example', 'package-lock.json']);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:sk|rk)_live_[A-Za-z0-9]{12,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /sk-[A-Za-z0-9]{20,}/,
  /\bark-[0-9a-f-]{20,}\b/i,
  /postgres(?:ql)?:\/\/(?!postgres:postgres@)[^\/@\s]+:[^\/@\s]+@/,
  /(password_hash|password_salt|pay_password_hash|pay_password_salt)\s*=\s*'[0-9a-f]{16,}'/i,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9+/_=\-]{20,}['"]\s*[;,]?$/i,
];
const findings = [];
for (const name of result.stdout.split(/\r?\n/).filter(Boolean)) {
  if (ignored.has(name) || /(^|[\\/])tests([\\/]|$)/.test(name) || /(^|[\\/])\.env/.test(name)) continue;
  let content;
  try { content = await fs.readFile(name, 'utf8'); } catch { continue; }
  for (const pattern of patterns) if (pattern.test(content)) findings.push(`${name}: ${pattern}`);
}
if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
else console.log('secret scan passed (test fixtures and environment templates excluded)');

