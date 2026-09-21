import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { wechatCredentialReadiness } from '../../lib/payments/wechatProvider.js';
import { alipayCredentialReadiness } from '../../lib/payments/alipayProvider.js';
import { readKeyOrPath } from '../../lib/payments/keyMaterial.js';

const completeWechat = {
  appId: 'wx_app',
  mchId: '1600000000',
  apiV3Key: '12345678901234567890123456789012',
  serialNo: 'ABCDEF1234567890',
  privateKey: '-----BEGIN PRIVATE KEY-----',
  publicKey: '-----BEGIN PUBLIC KEY-----',
};

test('P6 a channel counts as available only when payment can be verified back', () => {
  assert.deepEqual(wechatCredentialReadiness(completeWechat), { missing: [], webhookVerifiable: true, usable: true });

  // 缺平台公钥能扣款却验不了到账通知：订单会永远停在未支付，所以整条渠道必须判为不可用。
  const unverifiable = wechatCredentialReadiness({ ...completeWechat, publicKey: '' });
  assert.equal(unverifiable.webhookVerifiable, false);
  assert.equal(unverifiable.usable, false);
  assert.deepEqual(unverifiable.missing, [], '公钥缺失不影响下单能力，只影响回调可信度');

  const partial = wechatCredentialReadiness({ appId: 'wx_app' });
  assert.deepEqual(partial.missing, ['WECHAT_MCH_ID', 'WECHAT_API_V3_KEY', 'WECHAT_CERT_SERIAL_NO', 'WECHAT_PRIVATE_KEY(_PATH)']);
  assert.equal(wechatCredentialReadiness({}).usable, false);
  assert.equal(alipayCredentialReadiness({}).usable, false);
});

test('P6 alipay requires the app id and both key halves before it can settle', () => {
  const ready = alipayCredentialReadiness({ appId: '2021000000000000', privateKey: 'k', publicKey: 'p' });
  assert.deepEqual(ready, { missing: [], webhookVerifiable: true, usable: true });
  assert.deepEqual(
    alipayCredentialReadiness({ appId: '2021000000000000', privateKey: 'k' }).missing,
    ['ALIPAY_PUBLIC_KEY(_PATH)']
  );
});

test('P6 checkout and the public plans API share one availability predicate', () => {
  const paymentService = fs.readFileSync(new URL('../../lib/services/paymentService.js', import.meta.url), 'utf8');
  const plansRoute = fs.readFileSync(new URL('../../app/api/billing/plans/route.js', import.meta.url), 'utf8');
  const credentials = fs.readFileSync(new URL('../../lib/payments/providerCredentials.js', import.meta.url), 'utf8');

  assert.match(plansRoute, /paymentChannelStatus/);
  assert.doesNotMatch(plansRoute, /node:fs|process\.env\.ALIPAY_|process\.env\.WECHAT_/);
  assert.match(paymentService, /assertPaymentChannelUsable/);
  // 可用性判定必须发生在创建订单之前：先落一条 pending 订单再拒单，会留下扫不了的僵尸订单。
  assert.ok(
    paymentService.indexOf('assertPaymentChannelUsable') < paymentService.indexOf('await createOrder('),
    '渠道不可用时不能先创建订单'
  );

  // 同一份凭证解析规则只能存在一处：环境变量优先、密钥库兜底，且读失败必须与"没配"可区分。
  for (const lookup of [/secretReader\('wechat'/, /secretReader\('alipay'/, /readStripeSecret\('secret_key'/]) {
    assert.match(credentials, lookup);
  }
  assert.doesNotMatch(credentials, /\bgetProviderSecret\(/, '必须用 readProviderSecret，否则读失败会被当成未配置');
  assert.doesNotMatch(paymentService, /readProviderSecret\(|getProviderSecret\(/);
});

test('P6 key files on disk count as configured for both checkout and availability', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'koyosim-keys-'));
  const keyFile = path.join(dir, 'apiclient_key.pem');
  fs.writeFileSync(keyFile, '-----BEGIN PRIVATE KEY-----\nMIIBVw=\n-----END PRIVATE KEY-----\n');

  assert.equal(readKeyOrPath('', keyFile, 'test').includes('BEGIN PRIVATE KEY'), true);
  // 内联值优先于路径；两者都缺（含路径指向不存在的文件）返回 null，让密钥库继续兜底。
  assert.equal(readKeyOrPath(' inline ', keyFile, 'test'), 'inline');
  assert.equal(readKeyOrPath('', path.join(dir, 'missing.pem'), 'test'), null);
  assert.equal(readKeyOrPath('', '', 'test'), null);

  // 可用性判定与 Provider 必须读同一份密钥来源，否则用 _PATH 部署的商户会被判成未配置。
  const credentials = fs.readFileSync(new URL('../../lib/payments/providerCredentials.js', import.meta.url), 'utf8');
  const wechatProvider = fs.readFileSync(new URL('../../lib/payments/wechatProvider.js', import.meta.url), 'utf8');
  const alipayProvider = fs.readFileSync(new URL('../../lib/payments/alipayProvider.js', import.meta.url), 'utf8');
  for (const source of [credentials, wechatProvider, alipayProvider]) {
    assert.match(source, /from '\.\/keyMaterial\.js'/);
    assert.doesNotMatch(source, /function readKeyOrPath/);
  }
  assert.match(credentials, /WECHAT_PRIVATE_KEY_PATH/);
  assert.match(credentials, /ALIPAY_PUBLIC_KEY_PATH/);
  assert.match(credentials, /WECHAT_CERT_PATH/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('P6 the admin channel list cannot out-vote the checkout predicate', async () => {
  const overview = await fs.promises.readFile(new URL('../../lib/services/providers.js', import.meta.url), 'utf8');

  // 后台此前查的是从未写入过的 wechat:api_key，并且 stripe/wechat 的"测试连接"
  // 没有任何分支，于是一律记成 healthy。
  assert.match(overview, /const channels = await paymentChannelStatus\(\)/);
  for (const channel of ['stripe', 'wechat', 'alipay']) {
    assert.ok(
      overview.includes(`configured: channels.${channel}.enabled`),
      `${channel} 的后台就绪态必须来自统一判定`
    );
  }
  assert.doesNotMatch(overview, /hasProviderSecret\('wechat', 'api_key'\)/);
  assert.match(overview, /provider === 'stripe' \|\| provider === 'wechat' \|\| provider === 'alipay'/);
  // 支付宝网关对裸 GET 永远回 200，探测它只能证明网络通，不能证明凭据对。
  assert.doesNotMatch(overview, /openapi\.alipay\.com\/gateway\.do/);
});

test('P6 a secret-store read failure is never reported as merchant misconfiguration', async () => {
  const repo = await fs.promises.readFile(new URL('../../lib/repositories/providers.js', import.meta.url), 'utf8');
  const credentials = await fs.promises.readFile(new URL('../../lib/payments/providerCredentials.js', import.meta.url), 'utf8');
  const overview = await fs.promises.readFile(new URL('../../lib/services/providers.js', import.meta.url), 'utf8');

  // 查询失败与"库里没有这行"必须走不同的返回值：此前一个 catch 把两者都变成 null。
  assert.match(repo, /export async function readProviderSecret/);
  assert.match(repo, /return \{ status: 'error', value: null \}/);
  assert.match(repo, /return \{ status: 'absent', value: null \}/);
  assert.match(repo, /getProviderSecret[\s\S]{0,120}readProviderSecret\(provider, name\)\)\.value/);

  // 读失败要一路带到判定位：渠道状态先于"未配置"分出 unknown，下单给出可重试的 503。
  assert.match(credentials, /'unknown'/);
  assert.ok(
    credentials.indexOf("status === 'unknown'") > credentials.indexOf('async function computePaymentChannelStatus'),
    'unknown 判定必须出现在可用性判定之后、被复用为下单结论'
  );
  const guard = credentials.slice(credentials.indexOf('export async function assertPaymentChannelUsable'));
  assert.match(guard, /channel\.status === 'unknown'[\s\S]*?retryable: true/);
  assert.ok(
    guard.indexOf("channel.status === 'unknown'") < guard.indexOf('尚未完成配置'),
    '读失败不能被降级成"商户尚未完成配置"'
  );

  // 后台同样不能把读失败写成配置事故。
  assert.match(overview, /channel\.status === 'unknown'/);
  assert.match(overview, /SECRET_STORE_UNAVAILABLE/);
  assert.match(overview, /paymentChannelStatus\(\{ force: true \}\)/, '健康探测必须绕开缓存，否则测的是 30 秒前的状态');
});

test('P6 channel status is cached, coalesced and never cached while degraded', async () => {
  const { createStatusCache } = await import('../../lib/payments/statusCache.js');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let calls = 0;
  let release = null;
  const cache = createStatusCache({
    compute: async () => {
      calls += 1;
      if (release) await release;
      return { ok: true };
    },
    ttlMs: () => 50,
  });

  const first = cache.get();
  const second = cache.get();
  assert.equal(await first, await second, '并发请求必须合并成一次判定');
  await (release = Promise.resolve());
  assert.equal(calls, 1);
  assert.equal(await cache.get(), await first, 'TTL 内复用同一份结果');
  assert.equal(calls, 1);

  assert.notEqual(await cache.get({ force: true }), await first, 'force 必须重新判定');
  assert.equal(calls, 2);

  await sleep(60);
  assert.equal(calls, 2, '过期后不主动重算');
  await cache.get();
  assert.equal(calls, 3, '过期后的下一次请求重算');

  // 密钥库读失败时不落缓存：下一次请求就得重新确认，否则一次抖动会被固化 30 秒的假"未配置"。
  let degradedCalls = 0;
  const degradedCache = createStatusCache({
    compute: async () => ({ degraded: ++degradedCalls }),
    ttlMs: () => 60000,
    cacheable: (value) => !value.degraded,
  });
  await degradedCache.get();
  await degradedCache.get();
  assert.equal(degradedCalls, 2);

  // ttl=0 是运维逃生阀：完全退回实时判定。
  let liveCalls = 0;
  const liveCache = createStatusCache({ compute: async () => (++liveCalls && {}), ttlMs: () => 0 });
  await liveCache.get();
  await liveCache.get();
  assert.equal(liveCalls, 2);

  // 判定抛错不能把缓存卡死。
  let throwCalls = 0;
  const throwCache = createStatusCache({
    compute: async () => {
      throwCalls += 1;
      if (throwCalls === 1) throw new Error('db blip');
      return { ok: true };
    },
    ttlMs: () => 60000,
  });
  await assert.rejects(throwCache.get());
  assert.deepEqual(await throwCache.get(), { ok: true });
  assert.equal(throwCalls, 2);

  // 密钥轮换后必须立即可见，否则管理员刚存完就看到"未配置"。
  const invalidateCache = createStatusCache({ compute: async () => ({}), ttlMs: () => 60000 });
  const before = await invalidateCache.get();
  await invalidateCache.get();
  assert.equal(await invalidateCache.get(), before);
  invalidateCache.invalidate();
  assert.notEqual(await invalidateCache.get(), before);

  const credentialSource = await fs.promises.readFile(new URL('../../lib/payments/providerCredentials.js', import.meta.url), 'utf8');
  assert.match(credentialSource, /cacheable: isSettledStatus/);
  assert.match(credentialSource, /PAYMENT_CHANNEL_CACHE_TTL_MS/);
  const adminService = await fs.promises.readFile(new URL('../../lib/services/providers.js', import.meta.url), 'utf8');
  assert.match(adminService, /invalidatePaymentChannelStatus\(\)/);
  assert.ok(
    adminService.indexOf('invalidatePaymentChannelStatus()') > adminService.indexOf('const rotated = await withTransaction'),
    '缓存必须在密钥写入事务提交之后才失效'
  );
});

test('P6 the public plans payload exposes selection only, not credential diagnostics', async () => {
  const plansRoute = await fs.promises.readFile(new URL('../../app/api/billing/plans/route.js', import.meta.url), 'utf8');

  assert.match(plansRoute, /enabled: channel\.enabled/);
  for (const leaked of ['missingCredentials', 'unreadable', 'testModeOnly', 'mode']) {
    assert.ok(!plansRoute.includes(leaked), `公开接口不应回传 ${leaked}`);
  }
  // 仍然必须走同一份判定，且缓存要生效（不 force）。
  assert.match(plansRoute, /paymentChannelStatus\(\)/);
  assert.doesNotMatch(plansRoute, /force: true/);
});

test('P6 every payment and reconciliation knob is documented in .env.example', async () => {
  const documented = new Set(
    (await fs.promises.readFile(new URL('../../.env.example', import.meta.url), 'utf8'))
      .split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
      .filter(Boolean)
  );
  const paymentDirUrl = new URL('../../lib/payments', import.meta.url);
  const paymentFiles = (await fs.promises.readdir(paymentDirUrl))
    .filter((file) => file.endsWith('.js'))
    .map((file) => `lib/payments/${file}`);
  const sources = [
    ...paymentFiles,
    'lib/services/billing.js',
    'lib/services/paymentReconciliation.js',
    'lib/services/paymentService.js',
    'lib/services/webhookDispatcher.js',
    'scripts/generation-worker.mjs',
    'scripts/generation-worker-supervisor.mjs',
  ];
  const pattern = /process\.env\.((?:WECHAT|ALIPAY|STRIPE|WEBHOOK|PAYMENT|GENERATION_WORKER)[A-Z0-9_]*)/g;
  const used = new Set();
  for (const file of sources) {
    const text = await fs.promises.readFile(new URL(`../../${file}`, import.meta.url), 'utf8').catch(() => '');
    for (const match of text.matchAll(pattern)) {
      used.add(match[1]);
    }
  }
  for (const file of await fs.promises.readdir(new URL('../../app/api/billing', import.meta.url), { recursive: true })) {
    if (!String(file).endsWith('.js')) continue;
    // 工作树是多人共用的：目录里可能正有文件被增删，读不到就跳过。
    const text = await fs.promises.readFile(new URL(`../../app/api/billing/${file}`, import.meta.url), 'utf8').catch(() => '');
    for (const match of text.matchAll(pattern)) {
      used.add(match[1]);
    }
  }
  assert.ok(used.has('PAYMENT_CHANNEL_CACHE_TTL_MS'), '缓存开关本身没被采到，扫描可能失效');
  assert.ok(used.size >= 25, `只扫到 ${used.size} 个支付/对账变量，采集逻辑可能失效`);
  assert.deepEqual([...used].filter((name) => !documented.has(name)), []);
});
