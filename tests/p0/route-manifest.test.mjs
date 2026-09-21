import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 路由面的闸门本体。所有事实都从 scripts/route-map.mjs 的同一批推导函数拿，
// 所以"文档说的一套、运行时跑的另一套"在这里不可能同时成立。
//
// 刻意不碰数据库、不启服务：这一层只保证**声明与文件系统对齐**。
// 行为（307/308/404 到底返什么）要跑 npm run lint:routes 与真构建冒烟。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const {
  EXPECTED_LOCALE_CODES,
  MIN_API_ROUTES,
  MIN_PAGE_ROUTES,
  collect,
  renderMarkdown,
  structuralFailures,
  targetStateFailures,
} = await import('../../scripts/route-map.mjs');

const data = collect();

test('结构面全绿：策略命中、声明漂移、棘轮、文档同步、反空断言', () => {
  assert.deepEqual(structuralFailures(data), []);
});

test('每条页面路由恰好命中一条策略，且没有解析不到的跳转目标', () => {
  assert.deepEqual(data.audit.hard, []);
});

test('语言注册表恰好解析到 6 个码：读空了会让下面所有断言空跑', () => {
  assert.equal(data.registry.codes.length, EXPECTED_LOCALE_CODES.length);
  assert.deepEqual(data.registry.codes, EXPECTED_LOCALE_CODES);
});

test('扫描没失效：页面与处理器的数量还在阈值之上', () => {
  assert.ok(
    data.pages.length >= MIN_PAGE_ROUTES,
    `只扫到 ${data.pages.length} 条页面路由，阈值 ${MIN_PAGE_ROUTES}`,
  );
  assert.ok(
    data.handlers.length >= MIN_API_ROUTES,
    `只扫到 ${data.handlers.length} 个 route.js，阈值 ${MIN_API_ROUTES}`,
  );
});

test('每个已注册语言前缀的根与 /studio 都能解析到路由', () => {
  for (const row of data.reachability) {
    if (!row.rootPath) continue;
    assert.ok(row.rootResolves, `${row.code} 的 ${row.rootPath} 打不开`);
    assert.ok(row.studioResolves, `${row.code} 的 ${row.rootPath}/studio 打不开`);
  }
});

test('routePolicy 的三张表覆盖已提交的树：少登记判红，多登记进棘轮', () => {
  const { unprefixed, localized, tabs, slugTabs, slugKeywords } = data.audit.drift;
  const covered = (key, { declared, actual }) => {
    for (const item of actual) {
      assert.ok(declared.includes(item), `${key} 少了 ${item}：已提交的树里有它却没登记`);
    }
  };
  covered('UNPREFIXED_TOP_SEGMENTS', unprefixed);
  covered('STUDIO_TABS', tabs);
  for (const [prefix, pair] of Object.entries(localized)) covered(`LOCALIZED_PATHS${prefix}`, pair);
  // lib/studio-routes.js 是服务端路由校验读的那一份；还没入库时这一腿不参与。
  if (slugTabs.actual) {
    covered('lib/studio-routes.js STUDIO_TAB_IDS', slugTabs);
    covered('lib/studio-routes.js STUDIO_ALIAS_SEGMENTS', slugKeywords);
  }
  // 反方向（声明先于页面进来）不判红：那是要降回去的存量，棘轮规则 stale-declared-path 记着它。
  assert.ok(Object.hasOwn(data.audit.ratchet, 'stale-declared-path'), 'stale-declared-path 没进棘轮，多余的声明就没人管了');
});

test('免会话/签名/代理三张接口名单里的每条都真存在，反向也不许漏登记', () => {
  // 正反两个方向都在 audit.hard 里；这里只把"名单不为空"钉住，
  // 防止有人把 API_POLICIES 清空来让硬闸门空跑。
  assert.ok(data.handlers.length > 100);
  assert.deepEqual(data.audit.hard.filter((v) => v.startsWith('API_POLICIES')), []);
  assert.deepEqual(data.audit.hard.filter((v) => v.includes('捕获式代理')), []);
});

test('存量债务只许降不许升', () => {
  const { ratchet, baseline } = data.audit;
  for (const [rule, hits] of Object.entries(ratchet)) {
    assert.notEqual(baseline[rule], undefined, `棘轮规则 ${rule} 没有基线项：跑 npm run lint:routes:update`);
    assert.ok(
      hits.length <= baseline[rule],
      `棘轮规则 ${rule} 从 ${baseline[rule]} 涨到 ${hits.length}：${hits.slice(0, 8).join(', ')}`,
    );
  }
});

test('docs/route-map.md 与已提交的树同步：改树不改文档就判红', () => {
  // 仓库开了 autocrlf，工作副本里的换行符与生成时不一致是常态，比对按 LF 归一。
  const onDisk = readFileSync(path.join(repoRoot, 'docs', 'route-map.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(onDisk, renderMarkdown(data).replace(/\r\n/g, '\n'));
});

// 这一条是本轮（S1–S3）的成果锁：每一条失败都对应一个曾经真实存在的缺陷，
// 而不是一份"以后再说"的愿望清单。
test('语言收敛、软 404、重载预算与接口加固都已落地', () => {
  assert.deepEqual(targetStateFailures(), []);
});
