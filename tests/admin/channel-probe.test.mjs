import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mapWithConcurrency,
  normalizeProbeOutcome,
  probeFailureOutcome,
  summarizeProbeResults,
} from '../../lib/services/probeContract.js';
import { probeFeedback } from '../../lib/modelCenter/view.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFile(path.join(repoRoot, rel), 'utf8');

test('适配器口径不一致不再影响判定：healthy 与 status 两种写法都算连通', () => {
  assert.equal(normalizeProbeOutcome({ healthy: true, latencyMs: 42, probeKind: 'http' }).healthStatus, 'healthy');
  assert.equal(
    normalizeProbeOutcome({ status: 'healthy', latencyMs: 42, probeKind: 'http' }).healthStatus,
    'healthy'
  );
});

test('仅校验凭据的探针不得留下实测延迟', () => {
  const outcome = normalizeProbeOutcome({
    healthy: false,
    latencyMs: 0,
    probeKind: 'credential',
    message: '未配置 OPENAI_API_KEY',
  });
  assert.equal(outcome.latencyMs, null);
  assert.equal(outcome.probeKind, 'credential');
  // 没配 Key 是待办，不是渠道故障，不能染红。
  assert.equal(outcome.healthStatus, 'degraded');
});

test('上游明确不健康才判 unhealthy', () => {
  assert.equal(
    normalizeProbeOutcome({ status: 'unhealthy', latencyMs: 120, probeKind: 'http' }).healthStatus,
    'unhealthy'
  );
  assert.equal(
    normalizeProbeOutcome({ healthy: false, latencyMs: 120, probeKind: 'http', message: 'HTTP 503' }).healthStatus,
    'degraded'
  );
});

test('探针没有声明口径时保持未知，不冒充 HTTP 实测', () => {
  const outcome = normalizeProbeOutcome({ healthy: true, latencyMs: 8 }, { elapsedMs: 30 });
  assert.equal(outcome.probeKind, null);
  assert.equal(outcome.healthStatus, 'healthy');
});

test('探针返回不可判定内容时按 degraded 记账，而不是按成功', () => {
  const outcome = normalizeProbeOutcome(undefined, { elapsedMs: 5 });
  assert.equal(outcome.healthStatus, 'degraded');
  assert.equal(outcome.probeKind, null);
  assert.equal(outcome.latencyMs, 5);
});

test('没有测量值时延迟保持 null，不落到 0ms', () => {
  // Number(null) === 0 的陷阱：0ms 会被读成"这个渠道极快"。
  assert.equal(normalizeProbeOutcome({ healthy: true }).latencyMs, null);
  assert.equal(normalizeProbeOutcome({ healthy: true, latencyMs: null }, { elapsedMs: null }).latencyMs, null);
  assert.equal(normalizeProbeOutcome(undefined).latencyMs, null);
  assert.equal(normalizeProbeOutcome({ healthy: true, latencyMs: -8 }).latencyMs, null);
});

test('探针抛错记为 unhealthy 并保留错误码', () => {
  const outcome = probeFailureOutcome(Object.assign(new Error('socket hang up'), { code: 'ETIMEDOUT' }), {
    elapsedMs: 6003,
  });
  assert.equal(outcome.healthStatus, 'unhealthy');
  assert.equal(outcome.latencyMs, 6003);
  assert.equal(outcome.probeKind, 'http');
  assert.equal(outcome.errorCode, 'ETIMEDOUT');
});

test('探针消息截断，避免把上游报错正文整段带回后台', () => {
  const outcome = normalizeProbeOutcome({ healthy: false, probeKind: 'http', message: 'x'.repeat(500) });
  assert.equal(outcome.message.length, 200);
});

test('批量探测限并发且结果顺序与输入一致', async () => {
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 9 }, (_, i) => i);

  const results = await mapWithConcurrency(items, 3, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5 - item));
    active -= 1;
    return item * 2;
  });

  assert.deepEqual(results, items.map((i) => i * 2));
  assert.ok(maxActive <= 3, `并发上限被突破：${maxActive}`);
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
});

test('汇总把仅凭据探测单独计数，供 UI 说明口径', () => {
  const summary = summarizeProbeResults([
    { healthStatus: 'healthy', probeKind: 'http' },
    { healthStatus: 'degraded', probeKind: 'credential' },
    { healthStatus: 'unhealthy', probeKind: 'http' },
  ]);
  assert.deepEqual(summary, { probed: 3, healthy: 1, degraded: 1, unhealthy: 1, credentialOnly: 1 });
});

test('探测只有一种实现，熔断服务不再自带一份探针', async () => {
  const breaker = await read('lib/services/circuitBreaker.js');
  const repository = await read('lib/repositories/circuitBreaker.js');
  assert.doesNotMatch(breaker, /probeProviderChannel/, '熔断服务里不应再留一份探测实现');
  assert.doesNotMatch(breaker, /getProviderAdapter/);
  // SQL 属于仓储层；服务层只负责把 row.last_probe 映射成驼峰字段。
  assert.match(repository, /p\.metadata -> 'last_probe'/, '概览必须把落库的探测口径读出来');
  assert.match(breaker, /row\.last_probe/, '服务层必须消费仓储读出的探测口径');
  // Number(null) === 0：概览里的空值一律走 toFiniteMs，不再就地 Number() 兜底。
  assert.doesNotMatch(breaker, /Number\.isFinite\(Number\(/);
});

test('主动探测必须落库延迟与口径，且不覆盖渠道 metadata 其它键', async () => {
  const repo = await read('lib/repositories/aiCatalog.js');
  const health = repo.slice(repo.indexOf('export async function updateProviderHealth'));
  assert.match(health, /metadata = metadata \|\| \$\$\{/, 'last_probe 必须走 jsonb 顶层合并');
  assert.match(health, /last_probe/);
});

test('每个适配器都必须声明探针口径', async () => {
  const dir = path.join(repoRoot, 'lib/adapters');
  const files = (await fs.readdir(dir)).filter((name) => name.endsWith('Adapter.js'));
  assert.ok(files.length >= 9, `适配器数量异常：${files.length}`);

  for (const name of files) {
    const source = await fs.readFile(path.join(dir, name), 'utf8');
    const marker = 'async healthCheck';
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${name} 缺少 healthCheck`);

    const afterName = source.slice(start + marker.length);
    const boundary = afterName.search(/\n {2}(?:\/\*\*|async |get |set |static )/);
    const body = boundary === -1 ? afterName : afterName.slice(0, boundary);
    const returns = (body.match(/return \{/g) || []).length;
    const declared = (body.match(/probeKind:/g) || []).length;
    assert.ok(returns > 0, `${name} 的 healthCheck 没有返回值`);
    assert.equal(declared, returns, `${name} 有 ${returns} 个返回，但只有 ${declared} 个声明了 probeKind`);
  }
});

test('模型级与品牌级探测端点各自存在且鉴权到位', async () => {
  const batch = await read('app/api/admin/models/health/route.js');
  assert.match(batch, /body\.all === true/, '全量扫描要有显式入口');
  assert.match(batch, /providerIds/, '品牌级批量探测要能接多个供应商');
  assert.match(batch, /PERMISSIONS\.providersWrite/);
  assert.match(batch, /一次只能指定一种探测范围/, '多种范围并存时不能静默挑一种');

  const modelRoute = await read('app/api/admin/models/[id]/health/route.js');
  assert.match(modelRoute, /probeModelChannels/);
  assert.match(modelRoute, /PERMISSIONS\.providersWrite/);

  const service = await read('lib/services/healthProbe.js');
  assert.match(service, /MAX_TARGETS_PER_REQUEST/, '探针直连上游，单次规模必须有上界');
  assert.doesNotMatch(service, /Math\.random/);
});

test('停用的渠道不参与模型级探测', async () => {
  const service = await read('lib/services/healthProbe.js');
  const modelProbe = service.slice(service.indexOf('export async function probeModelChannels'));
  assert.match(modelProbe, /channels\.filter\(\(channel\) => channel\.enabled\)/);
});

test('探测发起前就失败的错误不得记成 HTTP 实测故障', () => {
  // 适配器工厂是 fail-closed 的：没有适配器 / 没有 Key 时根本没发出请求。
  for (const code of ['ADAPTER_NOT_CONFIGURED', 'PROVIDER_CREDENTIAL_MISSING']) {
    const outcome = probeFailureOutcome(Object.assign(new Error(`供应商未接入：${code}`), { code }), {
      elapsedMs: 3,
    });
    assert.equal(outcome.probeKind, 'credential', `${code} 不是网络往返`);
    assert.equal(outcome.latencyMs, null, '把 3ms 本地耗时装成实测延迟就是假数据');
    assert.equal(outcome.healthStatus, 'degraded', '没接上的渠道是待办，不该把整行染成故障');
    assert.equal(outcome.errorCode, code);
  }
});

test('探测结论必须同时写当前健康度与探测历史', async () => {
  const service = await read('lib/services/healthProbe.js');
  const persist = service.slice(service.indexOf('async function recordProbeOutcome'));
  assert.match(persist, /updateProviderHealth\(/, '路由读的是 ai_providers.health_status');
  assert.match(persist, /recordHealthCheck\(/, '模型中心的延迟列读的是 provider_health_checks');
  assert.match(persist, /withTransaction/, '两张表必须一起写成功，不留半条记录');
  assert.match(persist, /probeKind:/, '探针口径必须随结果落库，否则无法区分实测与凭据校验');
});

test('渠道测试端点不许自带第二份探针实现', async () => {
  const route = await read('app/api/admin/models/routing/test/route.js');
  assert.doesNotMatch(route, /getProviderAdapter/, '自己 adapter.healthCheck() 一次的结论不会落库');
  assert.match(route, /probeProviderChannel/);
  // 探测会改后端健康度并影响路由可用性，不再是只读操作。
  assert.match(route, /PERMISSIONS\.providersWrite/);
});

test('探测结论的复述口径：颜色跟健康度走，缺延迟时不补 0ms', () => {
  const http = probeFeedback({ healthStatus: 'healthy', probeKind: 'http', latencyMs: 123, message: 'OK' });
  assert.equal(http.tone, 'success');
  assert.equal(http.text, 'HTTP 实测 · OK · 123ms');

  const credential = probeFeedback({
    healthStatus: 'degraded',
    probeKind: 'credential',
    latencyMs: null,
    message: '凭据已配置，未请求上游',
  });
  assert.equal(credential.tone, 'warning');
  assert.equal(credential.text, '仅凭据校验 · 凭据已配置，未请求上游');
  assert.doesNotMatch(credential.text, /0ms|NaN/, '没有往返就没有延迟');

  // 上游 503 也是一次跑完的探测：HTTP 层成功不等于渠道健康。
  assert.equal(probeFeedback({ healthStatus: 'unhealthy', probeKind: 'http', latencyMs: 80 }).tone, 'danger');
  assert.equal(probeFeedback(undefined).tone, 'danger');
  assert.match(probeFeedback({}).text, /口径未知的探针/);
});

test('探测入口需要写权限，且探测后必须回读快照', async () => {
  const center = await read('app/admin/models/ModelControlCenter.jsx');
  const modelProbe = center.slice(center.indexOf('const handleProbeModelRoutes'));
  assert.ok(modelProbe, '缺少模型级探测入口');
  assert.match(modelProbe, /\/health/);
  assert.match(modelProbe, /if \(!canWrite/, '只读管理员看不到写操作的后果');
  assert.match(modelProbe, /await reload\(\)/, '后端健康度已经变了，前端必须回读');
  assert.match(modelProbe, /summary\.probed/, '汇总用服务端口径，前端不重算一遍判定');

  const drawer = await read('components/admin/model-center/ModelDetailDrawer.jsx');
  assert.match(drawer, /disabled=\{!canWrite \|\| !routes\.length \|\| pending\}/);
  assert.match(drawer, /canWrite && routes\.length > 1/, '探测全部渠道同样是写操作');
  // 仅凭据校验的渠道没有延迟数字，但必须与"从没探测过"区分开。
  assert.match(drawer, /probeKind === 'credential'/);

  const menu = await read('components/admin/model-center/ModelActionsMenu.jsx');
  assert.match(menu, /disabled=\{!canWrite \|\| !firstChannel \|\| busy\}/);

  const providers = await read('app/admin/models/providers/ProvidersManagerClient.jsx');
  assert.match(providers, /data\?\.results\?\.\[0\]/, '批量接口返回的是 results，不能再读 data.message');
  assert.match(providers, /healthStatus === 'healthy'/, '颜色必须跟健康度走，不是跟 HTTP 状态码');
});
