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

// Workspace packages are transpiled from source by `next.config.mjs`
// (`transpilePackages`), so their `exports` map is a real contract we can
// validate — a wrong `studio/ui/...` subpath or missing component export
// fails the same way `radix-ui`'s did: silently at build, loudly at runtime.
const workspacePackages = new Map();
(function indexWorkspacePackages() {
  const roots = [path.join(repoRoot, packageSource)];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const top = path.join(dir, entry.name);
      const candidates = [top, ...nestedPackageDirs(top)];
      for (const candidate of candidates) {
        const manifest = path.join(candidate, 'package.json');
        if (!fs.existsSync(manifest)) continue;
        try {
          const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
          if (pkg.name) workspacePackages.set(pkg.name, { name: pkg.name, dir: candidate, exports: pkg.exports });
        } catch {
          /* malformed manifests are not this gate's problem */
        }
      }
    }
  }
})();

function nestedPackageDirs(dir) {
  const inner = path.join(dir, 'packages');
  if (!fs.existsSync(inner)) return [];
  return fs.readdirSync(inner, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(inner, e.name));
}

function exportTarget(exportMap, subpath) {
  if (!exportMap || typeof exportMap !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(exportMap, subpath)) return flattenExport(exportMap[subpath]);
  for (const [key, value] of Object.entries(exportMap)) {
    if (!key.includes('*')) continue;
    const [prefix, suffix] = key.split('*');
    if (!subpath.startsWith(prefix) || (suffix && !subpath.endsWith(suffix))) continue;
    const wildcard = subpath.slice(prefix.length, suffix ? subpath.length - suffix.length : undefined);
    return flattenExport(value).replace('*', wildcard);
  }
  return null;
}

function flattenExport(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  for (const condition of ['import', 'require', 'default']) {
    const found = flattenExport(value[condition]);
    if (found) return found;
  }
  return '';
}

function resolveLocal(specifier, fromFile) {
  const repoAliased = !path.relative(repoRoot, fromFile).startsWith(`packages${path.sep}`);
  let base = null;
  if (specifier.startsWith('@/') && repoAliased) base = path.join(repoRoot, specifier.slice(2));
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = path.resolve(path.dirname(fromFile), specifier);
  else {
    const pkg = workspacePackages.get(specifier.split('/')[0]);
    if (!pkg) return null; // third-party from node_modules
    // Vendored workspace packages (`ai-agent`, `workflow-builder`, `design-agent`)
    // have no `exports` map and resolve to a bundled `dist` whose shapes don't
    // mirror `src`, so only `exports`-declaring packages (`studio`) are contract-checked.
    if (!pkg.exports) return null;
    const subpath = specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)
      ? (specifier === pkg.name ? '.' : `.${specifier.slice(pkg.name.length)}`)
      : null;
    if (subpath === null) return null;
    const target = exportTarget(pkg.exports, subpath);
    if (!target) return undefined; // declared package, undeclared subpath
    base = path.join(pkg.dir, target.replace(/^\.\//, ''));
  }
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
    if (!/^[.@~]/.test(specifier) && !workspacePackages.has(specifier.split('/')[0])) continue;
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
