// 自动重载的共用预算。三条路径（app/global-error.js、components/ChunkSelfHealing、
// 以及历史上的 app/error.js）各自记自己的冷却时间戳，键名与窗口互不知情 ——
// 一次 chunk 失败会让两条路径在 10s / 15s 的节奏上交替触发，页面来回刷新。
// 按 pathname 计数、只许在窗口内花掉有限次，是唯一能让它们达成一致的地方。

const KEY = 'koyosim_reload_budget';
const WINDOW_MS = 60_000;
const MAX_PER_PATH = 2;

function readStore() {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

/** 花掉一次重载配额；花不出去（已经刷过两次）就说明这不是瞬态故障，该把页面留给用户看。 */
export function trySpendReload() {
  if (typeof window === 'undefined') return false;
  const now = Date.now();
  const store = readStore();
  const bucket = window.location.pathname;
  const recent = Array.isArray(store[bucket]) ? store[bucket].filter((at) => now - at < WINDOW_MS) : [];
  if (recent.length >= MAX_PER_PATH) return false;
  recent.push(now);
  store[bucket] = recent;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 隐私模式 / 配额满：预算记不住就不自动刷，宁可停在错误页。
  }
  return true;
}

/** 带时间戳绕开缓存 —— 三个入口用同一个参数名，浏览器只会替换不会累加。 */
export function reloadBypassingCache() {
  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  window.location.replace(url.toString());
}
