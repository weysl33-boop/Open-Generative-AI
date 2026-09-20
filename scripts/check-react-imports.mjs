// Scan every first-party .js/.jsx for React APIs imported from a module that
// is not `react`. `radix-ui`, `next/navigation` and internal barrels only
// re-export a subset, so a mistaken hook compiles fine and dies at runtime
// with `x.createContext is not a function` — the exact class that took down
// /studio, /community and /pricing in one shot.
import fs from 'node:fs';
import path from 'node:path';

const REACT_API = new Set([
  'useState','useEffect','useContext','createContext','useMemo','useCallback','useRef','useReducer',
  'forwardRef','Fragment','Suspense','useId','useLayoutEffect','useTransition','useDeferredValue',
  'useSyncExternalStore','useImperativeHandle','useOptimistic','useActionState','createElement',
  'cloneElement','isValidElement','lazy','memo','Component','PureComponent','startTransition','cache',
]);
// `react` itself is the only provider of these; `next/*` exports a few of them
// deliberately (server components are allowed to import from next/headers etc).
const ALLOWED = new Set(['react', 'react-dom', 'react-dom/client']);
const DEFAULT_ROOTS = ['app', 'components', 'lib', 'packages', 'scripts', 'middleware.js'];
const IMPORT = /import\s+(?:type\s+)?(?:[\w$]+\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;

export function scanReactImports(roots = DEFAULT_ROOTS, cwd = process.cwd()) {
  const files = [];
  const walk = (target) => {
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        const child = path.join(target, entry);
        if (/node_modules|\.next|\.git|\.agents/.test(child)) continue;
        walk(child);
      }
    } else if (/\.(js|jsx|mjs)$/.test(path.basename(target))) {
      files.push(target);
    }
  };
  for (const root of roots) {
    const abs = path.resolve(cwd, root);
    if (fs.existsSync(abs)) walk(abs);
  }

  const problems = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const [, braces, specifier] = match;
      if (ALLOWED.has(specifier)) continue;
      const names = (braces || '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const bad = names.filter((name) => REACT_API.has(name));
      if (bad.length) {
        problems.push(`${path.relative(cwd, file)}:${source.slice(0, match.index).split('\n').length}  from "${specifier}" -> ${bad.join(', ')}`);
      }
    }
  }
  return { problems, fileCount: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { problems, fileCount } = scanReactImports(process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROOTS);
  for (const problem of problems) console.log(problem);
  console.log(`--- ${problems.length} React-API-from-wrong-module import(s) across ${fileCount} file(s)`);
  process.exit(problems.length ? 1 : 0);
}
