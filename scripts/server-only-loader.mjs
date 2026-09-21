// Node-only test/maintenance loader. Next.js still enforces `server-only`
// during application bundling; this loader only makes server modules callable
// from isolated Node test and migration processes.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  // `@/*` 是 jsconfig 里给 Next 的别名；node 不认，测试里 import 应用模块就会直接崩。
  if (specifier.startsWith('@/')) {
    for (const ext of EXTENSIONS) {
      const candidate = join(ROOT, specifier.slice(2) + ext);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

// `lib/locales.js` 直接 `import copy from '../messages/en/common.json'` —— webpack 允许，
// Node 22 却要求 `with { type: 'json' }`。在这里补上，测试才不必为了跑起来而重写成纯文本断言。
export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    return { format: 'json', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
  }
  return nextLoad(url, context);
}
