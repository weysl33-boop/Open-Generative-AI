import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computePricing, configuredMargin, deriveModel } from '../../lib/modelCenter/pricing.js';
import {
  channelAvailability,
  channelHealthState,
  costUsdToNumber,
  modelRouteIssues,
  officialCostOf,
  primaryChannelOf,
  sortChannelsForDisplay,
  switchableAlternatives,
} from '../../lib/modelCenter/routing.js';
import { deriveModelStats } from '../../lib/modelCenter/stats.js';
import { resolveCreditValuationFromSetting } from '../../lib/financial/creditValuation.js';
import {
  CHANNEL_LABELS,
  buildFacets,
  channelKindOf,
  channelOf,
  creditValuationSourceText,
  creditValuationText,
  fallbackCountOf,
  filterModels,
  healthOf,
  providerLabelOf,
  providersOf,
  routeStateOf,
  sortModels,
} from '../../lib/modelCenter/view.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RATE = 0.01;

/** 形状与 lib/repositories/models.js 装饰后的渠道保持一致。 */
function channel(overrides = {}) {
  return {
    id: 'ch_a',
    providerId: 'muapi',
    providerSlug: 'muapi',
    providerName: 'MuAPI 聚合网关',
    providerType: 'aggregator',
    providerModelId: 'flux-dev',
    priority: 100,
    enabled: true,
    providerEnabled: true,
    currency: 'USD',
    baseCost: 0.05,
    costConfigured: true,
    healthStatus: 'healthy',
    circuitState: 'closed',
    lastHealthCheckAt: '2026-09-20T10:00:00.000Z',
    adapterAvailable: true,
    credentialsConfigured: true,
    isPrimary: false,
    ...overrides,
  };
}

function model(overrides = {}) {
  return {
    id: 'flux-dev',
    name: 'FLUX Dev',
    type: 'image',
    provider: 'muapi',
    isActive: true,
    credits: 5,
    sortOrder: 1,
    routes: [],
    legacyCostUsd: null,
    ...overrides,
  };
}

test('成本未知必须让毛利一起变未知：禁止把「没回填成本」显示成 100% 毛利', () => {
  const unknown = computePricing({ providerCostUsd: null, credits: 5, creditUsdRate: RATE });
  assert.equal(unknown.providerCostUsd, null);
  assert.equal(unknown.costKnown, false);
  assert.equal(unknown.grossMarginUsd, null);
  assert.equal(unknown.marginRate, null);
  assert.equal(unknown.markup, null);

  // 0 与「未知」是两回事：0 是免费，必须照常算出 100% 毛利。
  const free = computePricing({ providerCostUsd: 0, credits: 5, creditUsdRate: RATE });
  assert.equal(free.costKnown, true);
  assert.equal(free.marginRate, 100);
});

test('渠道成本换算：缺失 / 为 0 / 币种不认识一律返回 null，不允许折算成 $0', () => {
  assert.equal(costUsdToNumber({ baseCost: 0, currency: 'USD' }), null);
  assert.equal(costUsdToNumber({ baseCost: null, currency: 'USD' }), null);
  assert.equal(costUsdToNumber({ baseCost: 'abc', currency: 'USD' }), null);
  assert.equal(costUsdToNumber({ baseCost: 1, currency: 'RANDOM' }), null);
  assert.equal(costUsdToNumber({ baseCost: 7.2, currency: 'CNY' }), 1);
  assert.equal(costUsdToNumber({ baseCost: 0.05, currency: 'USD' }), 0.05);
});

test('没有真实探测过的渠道不能显示成健康：建表默认值 healthy 不是事实', () => {
  assert.equal(channelHealthState(channel({ lastHealthCheckAt: null })), 'unknown');
  assert.equal(channelHealthState(channel()), 'healthy');
  assert.equal(channelHealthState(channel({ healthStatus: 'degraded' })), 'degraded');
  // 「没配凭据」是待办不是故障，不能染成红色。
  assert.equal(channelHealthState(channel({ credentialsConfigured: false })), 'unknown');
  assert.equal(channelHealthState(channel({ circuitState: 'circuit_open' })), 'unhealthy');
});

test('渠道可用性判定与运行时口径一致：无凭据 / 无 Adapter 的渠道不可切换', () => {
  assert.equal(channelAvailability(channel()).usable, true);
  for (const [label, overrides] of [
    ['缺少凭据', { credentialsConfigured: false }],
    ['缺少 Adapter', { adapterAvailable: false }],
    ['供应商停用', { providerEnabled: false }],
    ['渠道停用', { enabled: false }],
    ['熔断打开', { circuitState: 'open' }],
    ['健康检查未通过', { healthStatus: 'unhealthy' }],
  ]) {
    const result = channelAvailability(channel(overrides));
    assert.equal(result.usable, false, label);
    assert.ok(result.reason, `${label} 必须给出可展示的原因`);
  }
});

test('主渠道判定：钉选优先，未钉选时按 priority 取第一条可用渠道', () => {
  const routes = [
    channel({ id: 'ch_low', priority: 80 }),
    channel({ id: 'ch_high', priority: 120, providerSlug: 'kling', providerId: 'kling' }),
  ];
  // 没配置钉选时，顺序必须和路由器的 priority 口径一致，不能凭空改变选路结果。
  assert.deepEqual(
    sortChannelsForDisplay(routes).map((r) => r.id),
    ['ch_high', 'ch_low']
  );
  assert.equal(primaryChannelOf({ routes }).id, 'ch_high');

  const pinned = [
    channel({ id: 'ch_low', priority: 80, isPrimary: true }),
    channel({ id: 'ch_high', priority: 120 }),
  ];
  assert.equal(primaryChannelOf({ routes: pinned }).id, 'ch_low');

  // 钉选的渠道挂了，退回仍可用的渠道，而不是继续显示一个走不通的供应商。
  const brokenPin = [
    channel({ id: 'ch_low', priority: 80, isPrimary: true, healthStatus: 'unhealthy' }),
    channel({ id: 'ch_high', priority: 120 }),
  ];
  assert.equal(primaryChannelOf({ routes: brokenPin }).id, 'ch_high');
});

test('主表「实际供应商」与备用数：钉选渠道优先，未挂载才回落到目录字段', () => {
  const routes = [
    channel({ id: 'ch_pinned', providerSlug: 'kling', providerId: 'kling', providerName: 'Kling 官方', priority: 80, isPrimary: true }),
    channel({ id: 'ch_backup', providerSlug: 'volcengine', providerId: 'volcengine', providerName: '火山引擎', priority: 120 }),
    channel({ id: 'ch_off', providerSlug: 'google', providerId: 'google', providerName: 'Google', priority: 200, enabled: false }),
  ];
  const mounted = model({ provider: 'muapi', routes });
  // 目录字段仍写着 muapi，但运行时走的是钉选的 Kling：显示 provider 就是假信息。
  assert.equal(providerLabelOf(mounted), 'Kling 官方');
  assert.equal(fallbackCountOf(mounted), 1, '备用只数可用且非主渠道的渠道');
  assert.equal(routeStateOf(mounted), 'degraded', '有渠道被停用就是降级');

  assert.equal(providerLabelOf(model({ provider: 'muapi', routes: [] })), 'muapi');
  assert.equal(fallbackCountOf(model({ routes: [] })), 0);
  assert.equal(routeStateOf(model({ routes: [] })), 'unmounted');
});

test('按供应商排序看实际主渠道，不看 models_config.provider', () => {
  const a = model({
    id: 'a', name: 'A', provider: 'zzz',
    routes: [channel({ providerSlug: 'aaa', providerId: 'aaa', providerName: 'AAA' })],
  });
  const b = model({
    id: 'b', name: 'B', provider: 'aaa',
    routes: [channel({ providerSlug: 'zzz', providerId: 'zzz', providerName: 'ZZZ' })],
  });
  assert.deepEqual(sortModels([a, b], 'provider').map((m) => m.id), ['a', 'b']);
});

test('官方成本取值口径：当前渠道成本优先，其次历史列，都没有才是 null', () => {
  const routes = [channel({ id: 'ch_a', baseCost: 0.05 })];
  assert.deepEqual(
    officialCostOf({ routes, legacyCostUsd: 0.5 }),
    { costUsd: 0.05, source: 'provider_channel' }
  );
  assert.deepEqual(
    officialCostOf({ routes: [channel({ baseCost: 0, costConfigured: false })], legacyCostUsd: 0.5 }),
    { costUsd: 0.5, source: 'models_config' }
  );
  assert.deepEqual(officialCostOf({ routes: [], legacyCostUsd: 0 }), { costUsd: null, source: null });
});

test('模型派生：成本来源与毛利异常必须一起反映到 issues 上', () => {
  const priced = deriveModel(
    model({ routes: [channel({ baseCost: 0.05 })], legacyCostUsd: 0.04 }),
    RATE
  );
  assert.equal(priced.officialCostUsd, 0.05);
  assert.equal(priced.costSource, 'provider_channel');
  assert.equal(priced.userPriceUsd, 0.05);
  assert.equal(priced.marginRate, 0);
  assert.deepEqual(
    priced.issues.map((issue) => issue.code),
    ['no-fallback']
  );

  const bare = deriveModel(model({ routes: [], credits: 0 }), RATE);
  assert.equal(bare.officialCostUsd, null);
  assert.equal(bare.marginRate, null);
  assert.deepEqual(
    bare.issues.map((issue) => issue.code),
    ['no-channel']
  );
});

test('路由问题分类：缺成本是定价待办，不能冒充成渠道故障', () => {
  const issues = modelRouteIssues(
    deriveModel(model({ routes: [channel({ baseCost: 0 })], credits: 0 }), RATE)
  );
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes('cost-missing'));
  assert.ok(codes.includes('credits-missing'));
  assert.ok(!codes.includes('primary-unavailable'), '成本缺失不应被判为主渠道不可用');
});

test('统计卡口径：异常路由计数与毛利样本量都必须可追溯', () => {
  const healthy = deriveModel(model({ id: 'a', routes: [channel(), channel({ id: 'b', providerSlug: 'kling', providerId: 'kling', providerName: 'Kling' })] }), RATE);
  const unhealthy = deriveModel(
    model({ id: 'b', routes: [channel({ credentialsConfigured: false, healthStatus: 'unhealthy' })] }),
    RATE
  );
  const costless = deriveModel(model({ id: 'c', routes: [channel({ baseCost: 0 })] }), RATE);
  const stats = deriveModelStats([healthy, unhealthy, costless]);

  assert.equal(stats.total, 3);
  assert.equal(stats.healthyModels, 2);
  assert.equal(stats.unhealthyModels, 1);
  assert.equal(stats.unknownModels, 0);
  // costless 缺的是成本，但它同时只有一条渠道，缺备用仍计入异常路由。
  assert.equal(stats.anomalousRoutes, 2);
  assert.equal(stats.costMissing, 1);
  assert.equal(stats.providers, 2);
  assert.equal(stats.negativeMarginModels, 0);
  assert.equal(stats.marginSampleSize, 2);
  assert.ok(stats.marginRateConfigured !== null);
});

test('平均毛利率：没有可计算样本时返回 null，禁止用 0% 占位', () => {
  const empty = configuredMargin([model({ officialCostUsd: null, userPriceUsd: null })]);
  assert.equal(empty.marginRate, null);
  assert.equal(empty.marginRateMedian, null);
  assert.equal(empty.sampleSize, 0);
});

test('筛选项来自真实路由数据：供应商列表不来自硬编码，也不来自 models_config.provider', () => {
  const routes = [
    channel({ providerSlug: 'kling', providerId: 'kling', providerName: 'Kling 官方' }),
    channel({ id: 'ch_muapi', providerSlug: 'muapi', providerId: 'muapi', providerName: 'MuAPI 聚合网关' }),
  ];
  const list = [model({ id: 'a', provider: 'muapi', routes })];
  assert.deepEqual(providersOf(list[0]).sort(), ['kling', 'muapi']);

  const facets = buildFacets(list);
  const providers = facets.providers.map((item) => item.value);
  assert.deepEqual([...providers].sort(), ['kling', 'muapi']);
  assert.equal(
    facets.providers.find((item) => item.value === 'kling').label,
    'Kling 官方',
    '筛选项必须显示真实品牌名而不是内部 id'
  );

  assert.equal(filterModels(list, { providers: ['kling'] }).length, 1);
  assert.equal(filterModels(list, { providers: ['openai'] }).length, 0);
  assert.equal(healthOf(list[0]), 'healthy');
  assert.equal(filterModels(list, { health: ['unhealthy'] }).length, 0);
});

test('成本排序必须把「未配置」排到末尾，而不是算成 NaN 打乱全表', () => {
  const list = [
    model({ id: 'cheap', name: 'A', officialCostUsd: 0.01 }),
    model({ id: 'unknown', name: 'B', officialCostUsd: null }),
    model({ id: 'pricier', name: 'C', officialCostUsd: 0.5 }),
  ];
  assert.deepEqual(
    sortModels(list, 'cost-desc').map((m) => m.id),
    ['pricier', 'cheap', 'unknown']
  );
  assert.deepEqual(
    sortModels(list, 'cost-asc').map((m) => m.id),
    ['cheap', 'pricier', 'unknown']
  );
});

test('可切换目标只包含真正可用的渠道，避免把管理员引导到调用不通的供应商', () => {
  const routes = [
    channel({ id: 'current', priority: 120, providerSlug: 'muapi', providerId: 'muapi' }),
    channel({ id: 'ok', providerSlug: 'kling', providerId: 'kling' }),
    channel({ id: 'no-cred', providerSlug: 'openai', providerId: 'openai', credentialsConfigured: false }),
    channel({ id: 'disabled', providerSlug: 'google', providerId: 'google', enabled: false }),
  ];
  const targets = switchableAlternatives({ routes }).map((r) => r.providerSlug);
  assert.deepEqual(targets, ['kling']);
});

test('调用渠道只认 provider_type：没有渠道就是未确认，不许按供应商名字猜直连/聚合', () => {
  const routes = [
    channel({ providerSlug: 'kling', providerId: 'kling', providerType: 'official' }),
    channel({ id: 'ch_b', providerSlug: 'other', providerId: 'other', providerType: null }),
  ];
  assert.equal(channelOf({ routes }), 'direct');
  assert.equal(
    channelOf({ routes: [channel({ providerType: 'aggregator' })], provider: 'kling' }),
    'aggregator'
  );

  // 曾经这里写着 provider === 'muapi' 即聚合：没挂载渠道的模型只能显示未确认。
  assert.equal(channelOf({ routes: [], provider: 'muapi' }), 'unknown');
  assert.equal(channelOf(model({ provider: 'muapi' })), 'unknown');
  assert.equal(CHANNEL_LABELS.unknown, '未确认');

  // 单条渠道同样没有证据就不许默认成官方直连。
  assert.equal(channelKindOf({ providerType: null }), 'unknown');
  assert.equal(channelKindOf({ providerType: 'aggregator' }), 'aggregator');
  assert.equal(channelKindOf({ providerType: 'official' }), 'direct');
});

test('估值口径只有一个来源：设置里的数字优先，非法就整份退回内置值', () => {
  const builtIn = resolveCreditValuationFromSetting(null);
  assert.equal(builtIn.source, 'default');
  assert.equal(builtIn.usdPerCredit, 0.01);
  assert.equal(builtIn.creditsPerUsd, 100);
  assert.equal(builtIn.cnyPerCredit, 0.072);

  const configured = resolveCreditValuationFromSetting({ usdPerCredit: 0.02, usdToCnyRate: 7 });
  assert.equal(configured.source, 'setting');
  assert.equal(configured.creditsPerUsd, 50);
  assert.equal(configured.cnyPerCredit, 0.144);
  // 汇率不是配置项：渠道成本换算走另一个常量，放开一半会造成「改了不生效」的假设置。
  assert.equal(configured.usdToCnyRate, 7.2);

  // 0、非数字、缺字段一律整份退回并标成 invalid，不做半个口径的合并。
  for (const raw of [{ usdPerCredit: 0 }, { usdPerCredit: 'abc' }, { usdToCnyRate: -1 }, 'nope', []]) {
    const result = resolveCreditValuationFromSetting(raw);
    assert.equal(result.source, 'invalid', `${JSON.stringify(raw)} 不能被当成合法估值`);
    assert.equal(result.usdPerCredit, builtIn.usdPerCredit);
  }

  // 页面必须把来源说出来：数字本身看不出是配置值还是兜底值。
  assert.equal(creditValuationSourceText(configured), '来自系统设置 credit_valuation');
  assert.match(creditValuationText(configured), /\$0\.0200/);
});

test('报价链路不许再自带第二套 Credits 估值：¥0.07 那一轨必须消失', async () => {
  const engine = await fs.readFile(
    path.join(repoRoot, 'lib/services/pricingEngine.js'),
    'utf8'
  );
  assert.ok(!/CNY_PER_CREDIT/.test(engine), '报价链路又出现第二套估值口径');
  assert.ok(!/USD_PER_CNY/.test(engine), '报价链路不得自己换算美元');

  // 报表与模型中心一律走 resolveCreditValuation，不再直接引用内置常量。
  for (const rel of ['lib/services/models.js', 'lib/services/analyticsFinancial.js']) {
    const source = await fs.readFile(path.join(repoRoot, rel), 'utf8');
    assert.ok(!/CREDIT_VALUATION/.test(source), `${rel} 仍在直接读内置估值常量`);
    assert.ok(/resolveCreditValuation/.test(source), `${rel} 未通过统一入口取估值口径`);
  }
});

test('模型中心代码里不允许出现随机数或 Math.random 兜底：探测/成本/健康必须来自真实数据', async () => {
  const roots = ['app/admin/models', 'components/admin/model-center', 'lib/modelCenter'];
  const files = [];
  for (const root of roots) {
    const dir = path.join(repoRoot, root);
    const entries = await fs.readdir(dir, { recursive: true });
    for (const entry of entries) {
      if (/\.(?:js|jsx|mjs)$/.test(entry)) files.push(path.join(dir, entry));
    }
  }
  assert.ok(files.length >= 10, '应扫描到模型中心的前后端源码');
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    assert.ok(
      !/Math\.random\s*\(/.test(source),
      `${path.relative(repoRoot, file)} 使用了 Math.random()，延迟/健康/成本一律不许模拟`
    );
  }
});

test('供应商切换是两步确认弹层，不是原生 select；成功后整行由服务端回读', async () => {
  const panel = await fs.readFile(
    path.join(repoRoot, 'components/admin/model-center/ModelProviderSwitch.jsx'),
    'utf8'
  );
  assert.ok(/PopoverContent/.test(panel), '切换必须走弹层面板');
  assert.ok(!/<select\b/i.test(panel), '禁止用原生 <select> 承担供应商切换');
  for (const label of ['当前使用', '成本最低', '延迟最低', '确认改接']) {
    assert.ok(panel.includes(label), `切换面板缺少「${label}」这一状态`);
  }
  assert.ok(/const ok = await onSwitch\(/.test(panel), '必须等后端返回再决定面板去留');

  const controller = await fs.readFile(
    path.join(repoRoot, 'app/admin/models/ModelControlCenter.jsx'),
    'utf8'
  );
  const patch = controller.match(/const applyProviderSwitch = [\s\S]*?\n  \);/)?.[0];
  assert.ok(patch, '缺少 applyProviderSwitch');
  assert.ok(/payload\.data/.test(patch), '整行状态取自服务端返回，不做乐观更新');
  const handler = controller.match(/const handleSwitchProvider = [\s\S]*?\n  \);/)?.[0];
  assert.ok(handler, '缺少 handleSwitchProvider');
  assert.ok(/if \(ok\) await reload\(\)/.test(handler), '改接成功后要回读快照，统计卡与筛选项同样是派生值');
});
