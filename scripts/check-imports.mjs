import fs from 'node:fs';
import path from 'node:path';

// `next build` only emits "Attempted import error" *warnings* for a named import
// that the target module never exports, so a mistyped repository/service import
// ships to production as an `undefined is not a function` at runtime. This gate
// fails the build pipeline on that class instead of warning about it.
const repoRoot = process.cwd();
const roots = ['app', 'components', 'lib', 'messages', 'scripts'];
const packageSource = 'packages';
const skipDirs = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git']);
const extensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

function collect(dir, out = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) collect(path.join(dir, entry.name), out);
    } else if (extensions.includes(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const sources = [
  ...roots.flatMap((root) => collect(path.join(repoRoot, root))),
  ...collect(path.join(repoRoot, packageSource)).filter((file) => /[/\\]src[/\\]/.test(file)),
];

function resolveLocal(specifier, fromFile) {
  const repoAliased = !path.relative(repoRoot, fromFile).startsWith(`packages${path.sep}`);
  let base = null;
  if (specifier.startsWith('@/') && repoAliased) base = path.join(repoRoot, specifier.slice(2));
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = path.resolve(path.dirname(fromFile), specifier);
  if (!base) return null;
  const candidates = [base, ...extensions.map((ext) => base + ext)];
  for (const dir of ['', 'src']) {
    for (const ext of extensions) candidates.push(path.join(base + dir, `index${ext}`));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined; // local specifier that must exist but does not
}

const exportCache = new Map();
function exportsOf(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const names = new Set();
  const source = fs.readFileSync(file, 'utf8');
  // Wildcard re-exports cannot be enumerated cheaply; treat the module as opaque.
  let opaque = /export\s+\*\s*(?:as\s+[A-Za-z0-9_$]+\s+)?from/.test(source);
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of match[1].split(',')) {
      const alias = part.split(':').pop();
      const name = alias.trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const exported = trimmed.split(/\s+as\s+/).pop().trim();
      if (exported === '*') opaque = true;
      else if (exported) names.add(exported);
    }
  }
  if (/export\s+default/.test(source)) names.add('default');
  const result = { names, opaque };
  exportCache.set(file, result);
  return result;
}

const problems = [];
for (const file of sources) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/import\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (!/^[.@~]/.test(specifier) && !specifier.startsWith('@/')) continue;
    const target = resolveLocal(specifier, file);
    if (target === null) continue; // third-party
    if (target === undefined) {
      problems.push(`${path.relative(repoRoot, file)}: cannot resolve local import '${specifier}'`);
      continue;
    }
    const { names, opaque } = exportsOf(target);
    const named = clause.match(/\{([^}]*)\}/s);
    if (named && !opaque) {
      for (const part of named[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const imported = trimmed.split(/\s+as\s+/)[0].trim();
        if (!names.has(imported)) {
          problems.push(`${path.relative(repoRoot, file)}: '${imported}' is not exported from '${specifier}'`);
        }
      }
    }
    const namespace = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
    if (namespace && !opaque) {
      const alias = namespace[1];
      for (const member of source.matchAll(new RegExp(`${alias}\\.([A-Za-z0-9_$]+)`, 'g'))) {
        if (!names.has(member[1])) {
          problems.push(`${path.relative(repoRoot, file)}: '${alias}.${member[1]}' is not exported from '${specifier}'`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`import contract check failed: ${problems.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`import contract check passed (${sources.length} files)`);
}
