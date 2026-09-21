import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sanitizeChinaIpBlockConfig,
  resolveClientIp,
  isChinaIp,
  isIpInWhitelist,
  updateCachedConfig,
  invalidateChinaIpConfigCache,
  saveChinaIpBlockStateToFile,
  getChinaIpBlockConfig,
  getChinaIpBlockStateFile,
  getIpLibraryStatus,
  loadChinaIpRanges,
  ipToInt,
} from '../../lib/security/chinaIpBlock.js';
import { evaluateChinaIpGate, isExemptPath } from '../../lib/security/chinaIpGate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

// getChinaIpBlockConfig 有 2 秒内存缓存；测试只喂内存，绝不写 data/ 下的运行时镜像，
// 否则一次误提交就等于把境内访问全站锁死。
function armGate(overrides) {
  updateCachedConfig(sanitizeChinaIpBlockConfig(overrides));
}

function makeRequest(pathname, headers = {}) {
  const request = new Request(`https://www.koyosim.com${pathname}`, { headers });
  return Object.assign(request, { nextUrl: new URL(`https://www.koyosim.com${pathname}`) });
}

const CN_IP = '223.104.3.1';
const FOREIGN_IP = '8.8.8.8';

test('P7 the mainland gate is off until an operator turns it on', () => {
  const defaults = sanitizeChinaIpBlockConfig({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.action, 'forbidden');
  assert.equal(defaults.block_api, true);
  assert.equal(defaults.whitelist_ips, '');
  assert.equal(sanitizeChinaIpBlockConfig({ enabled: 'true' }).enabled, false);
});

test('P7 gate config sanitising bounds what middleware is fed', () => {
  const dirty = sanitizeChinaIpBlockConfig({
    action: 'redirect_home',
    custom_message: 'x'.repeat(5000),
    whitelist_ips: 'y'.repeat(9000),
    block_api: 'yes',
  });
  assert.equal(dirty.action, 'forbidden');
  assert.equal(dirty.custom_message.length, 500);
  assert.equal(dirty.whitelist_ips.length, 4000);
  assert.equal(dirty.block_api, true);
});

test('P7 only nginx-trusted headers decide the visitor IP', () => {
  // 最左边的 XFF 条目由客户端掌控，必须从右往左取第一个公网地址。
  const spoofed = resolveClientIp(new Headers({ 'x-forwarded-for': `${FOREIGN_IP}, 203.0.113.9` }));
  assert.equal(spoofed.ip, '203.0.113.9');
  assert.equal(spoofed.source, 'x-forwarded-for');

  const viaRealIp = resolveClientIp(
    new Headers({ 'x-real-ip': CN_IP, 'x-forwarded-for': FOREIGN_IP }),
  );
  assert.equal(viaRealIp.ip, CN_IP);
  assert.equal(viaRealIp.source, 'x-real-ip');

  assert.deepEqual(resolveClientIp(new Headers()), { ip: '127.0.0.1', source: 'unknown-defaults' });
});

test('P7 the x-test-ip override cannot bypass the gate in production', () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.CHINA_IP_GATE_TEST_TOKEN;
    const bypass = resolveClientIp(new Headers({ 'x-test-ip': FOREIGN_IP, 'x-real-ip': CN_IP }));
    assert.equal(bypass.ip, CN_IP);

    process.env.CHINA_IP_GATE_TEST_TOKEN = 'smoke-token';
    const authorised = resolveClientIp(
      new Headers({ 'x-test-ip': FOREIGN_IP, 'x-test-ip-token': 'smoke-token', 'x-real-ip': CN_IP }),
    );
    assert.equal(authorised.ip, FOREIGN_IP);
    assert.equal(authorised.source, 'x-test-ip');

    process.env.NODE_ENV = 'development';
    const dev = resolveClientIp(new Headers({ 'x-test-ip': FOREIGN_IP, 'x-real-ip': CN_IP }));
    assert.equal(dev.ip, FOREIGN_IP);
  } finally {
    process.env.NODE_ENV = original;
    delete process.env.CHINA_IP_GATE_TEST_TOKEN;
  }
});

test('P7 range matching flags mainland addresses and spares the rest', () => {
  assert.equal(isChinaIp(CN_IP), true);
  assert.equal(isChinaIp(FOREIGN_IP), false);
  assert.equal(isChinaIp('10.0.0.5'), false);
  assert.equal(isChinaIp('2400:3200::1'), true);
  // CDN 国家头是快速通道，即使回源地址是内网也必须命中。
  assert.equal(isChinaIp(FOREIGN_IP, new Headers({ 'cf-ipcountry': 'CN' })), true);
  assert.equal(isIpInWhitelist(CN_IP, '223.104.0.0/16'), true);
  assert.equal(isIpInWhitelist(CN_IP, '8.8.8.8'), false);
});

test('P7 the gate blocks mainland visitors and lets everyone else through', () => {
  armGate({ enabled: true });
  assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).blocked, true);
  assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': FOREIGN_IP })).reason, 'non-china');

  armGate({ enabled: false });
  const off = evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP }));
  assert.equal(off.blocked, false);
  assert.equal(off.reason, 'disabled');
});

test('P7 whitelisted and private mainland IPs are never blocked', () => {
  armGate({ enabled: true, whitelist_ips: `${FOREIGN_IP}\n${CN_IP}` });
  assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'whitelist');

  armGate({ enabled: true });
  assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': '127.0.0.1' })).reason, 'private');
});

test('P7 payment and provider callbacks survive the gate', () => {
  // 这些来源本身就在大陆网段内，掐断它们等于掐断支付回执与异步出图。
  for (const pathname of [
    '/api/billing/webhooks/alipay',
    '/api/billing/webhooks/wechat',
    '/api/generations/gen_123/callback',
    '/api/health',
  ]) {
    assert.equal(isExemptPath(pathname), true, pathname);
    armGate({ enabled: true });
    const decision = evaluateChinaIpGate(makeRequest(pathname, { 'x-real-ip': CN_IP }));
    assert.equal(decision.blocked, false, pathname);
    assert.equal(decision.reason, 'exempt-path', pathname);
  }
});

test('P7 exemptions stay confined to API callbacks, never pages or ordinary endpoints', async () => {
  // 豁免表是门禁唯一的旁路：一条过宽的前缀就能让整个功能形同虚设，
  // 所以钉死"页面与常规接口永远在门禁内"，加宽豁免必须先让这条断言变红。
  armGate({ enabled: true });
  for (const pathname of [
    '/', '/login', '/studio', '/admin/settings',
    '/api/auth/login', '/api/auth/me', '/api/user/profile',
    '/api/admin/settings', '/api/generations/gen_123',
  ]) {
    assert.equal(isExemptPath(pathname), false, pathname);
    assert.equal(
      evaluateChinaIpGate(makeRequest(pathname, { 'x-real-ip': CN_IP })).blocked,
      true,
      pathname,
    );
  }

  const src = await source('lib/security/chinaIpGate.js');
  const [, prefixList] = src.match(/const EXEMPT_PREFIXES = \[([^\]]*)\]/);
  for (const literal of prefixList.match(/'[^']+'/g) ?? []) {
    assert.ok(literal.slice(1, -1).startsWith('/api/'), literal);
  }
});

test('P7 block_api=false keeps mainland API access alive while pages stay blocked', () => {
  armGate({ enabled: true, block_api: false });
  const api = evaluateChinaIpGate(makeRequest('/api/user/profile', { 'x-real-ip': CN_IP }));
  assert.equal(api.blocked, false);
  assert.equal(api.reason, 'api-allowed');
  assert.equal(evaluateChinaIpGate(makeRequest('/studio', { 'x-real-ip': CN_IP })).blocked, true);
});

test('P7 a forced-off gate and a broken request both fail open', () => {
  const original = process.env.CHINA_IP_GATE_DISABLED;
  try {
    armGate({ enabled: true });
    process.env.CHINA_IP_GATE_DISABLED = 'true';
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'forced-off');

    process.env.CHINA_IP_GATE_DISABLED = 'false';
    const broken = evaluateChinaIpGate({ headers: new Headers(), nextUrl: null, url: 'not a url' });
    assert.equal(broken.blocked, false);
    assert.equal(broken.reason, 'error');
  } finally {
    process.env.CHINA_IP_GATE_DISABLED = original;
  }
});

test('P7 middleware runs the gate on the Node runtime and answers APIs with JSON', async () => {
  const [middleware, response, settingsService, adminApi] = await Promise.all([
    source('middleware.js'),
    source('lib/security/chinaIpResponse.js'),
    source('lib/services/settings.js'),
    source('app/api/admin/settings/route.js'),
  ]);

  assert.match(middleware, /runtime:\s*'nodejs'/);
  assert.match(middleware, /evaluateChinaIpGate\(request\)/);
  assert.match(middleware, /buildGateResponse\(request, gate\)/);
  assert.match(middleware, /'\/api\/:path\*'/);

  // 接口不能收到 HTML；提示页必须带 noindex。
  assert.match(response, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(response, /status: 403/);
  assert.match(response, /X-Robots-Tag': 'noindex, nofollow/);

  // 库与运行时镜像必须同源写入，写失败要冒泡成 warning 而不是伪装成功。
  assert.match(settingsService, /GATE_SETTING_KEY = 'china_ip_block'/);
  assert.match(settingsService, /saveChinaIpBlockStateToFile\(storedValue\)/);
  assert.match(settingsService, /if \(mirror\.error\) return \{ \.\.\.result, warning: mirror\.error \}/);
  assert.match(adminApi, /warning: result\.warning/);
});

test('P7 the admin settings page exposes the switch and its runtime truth', async () => {
  const [page, editor, gitignore] = await Promise.all([
    source('app/admin/settings/page.js'),
    source('app/admin/settings/SettingsEditor.js'),
    source('.gitignore'),
  ]);

  assert.match(page, /gateDiagnostics=\{gateDiagnostics\}/);
  assert.match(editor, /中国大陆 IP 访问拦截/);
  assert.match(editor, /saveSetting\(\s*'china_ip_block'/);
  assert.match(editor, /whitelist_ips: gateWhitelist/);
  assert.match(editor, /同步最新 IP 库/);
  // 白名单是运营与管理员的真实出口 IP，只能存 private，也绝不能进匿名设置出口。
  assert.match(editor, /'china_ip_block',[\s\S]{0,400}?'private'/);
  const syncRoute = await source('app/api/admin/settings/sync-ip-list/route.js');
  assert.match(syncRoute, /key: 'china_ip_block'[\s\S]{0,200}?visibility: 'private'/);
  const publicConfig = await source('app/api/site/content-config/route.js');
  assert.doesNotMatch(publicConfig, /china_ip_block/);
  // 同步只允许覆盖 data/ 的运行时副本：写进 lib/security/ 会让线上树相对 git 漂移，
  // 一次回滚发布就把 IP 库打回旧版。
  const block = await source('lib/security/chinaIpBlock.js');
  assert.match(block, /function getRangesWritePath\(\)[\s\S]{0,120}data[\s\S]{0,60}china_ip_ranges\.json/);
  assert.match(block, /fs\.writeFileSync\(filePath, JSON\.stringify\(updatedData\)\)/);
  assert.doesNotMatch(block, /for \(const filePath of getRangesFilePaths\(\)\)\s*\{\s*try/);
  // 镜像写失败时不能提示"已成功更新"。
  assert.match(editor, /data\?\.data\?\.warning/);
  // 运行时镜像是机器状态，绝不允许进版本库：一份残留的 enabled:true 会让默认关闭失效。
  assert.match(gitignore, /^data\/ip_block_state\.json$/m);
});

test('P7 saving the switch in the console reaches the request path through the runtime mirror', async () => {
  // 后台点"保存"到 middleware 生效之间隔着一次落盘与一次缓存过期。
  // 这一段跑在临时工作目录里：绝不往仓库 data/ 写运行时镜像。
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'ip-gate-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(sandbox);
    await fs.mkdir(path.join(sandbox, 'data'), { recursive: true });
    await fs.writeFile(
      path.join(sandbox, 'data', 'china_ip_ranges.json'),
      JSON.stringify({
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'sandbox',
        v4Ranges: [[ipToInt('223.104.0.0'), ipToInt('223.104.255.255')]],
        v6Ranges: [],
      }),
    );
    loadChinaIpRanges(true);
    // data/ 的运行时副本必须优先于随代码发布的基线库，否则后台同步永远不生效。
    assert.equal(getIpLibraryStatus().source, 'sandbox');
    assert.equal(isChinaIp(CN_IP), true);

    // 没有镜像文件就是关闭：一次发布不会误伤境内。
    invalidateChinaIpConfigCache();
    assert.equal(getChinaIpBlockConfig().enabled, false);
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'disabled');

    const saved = saveChinaIpBlockStateToFile({ enabled: true, action: 'forbidden' });
    assert.equal(saved.error, undefined);
    assert.ok(saved.config.enabled);

    // 模拟 middleware 进程在下一轮轮询里重新读盘。
    invalidateChinaIpConfigCache();
    const mainland = evaluateChinaIpGate(makeRequest('/studio', { 'x-real-ip': CN_IP }));
    assert.equal(mainland.blocked, true);
    assert.equal(mainland.reason, 'china-ip');
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': FOREIGN_IP })).reason, 'non-china');

    // 关开关与加白名单同样只能经由落盘生效。
    saveChinaIpBlockStateToFile({ enabled: true, whitelist_ips: CN_IP });
    invalidateChinaIpConfigCache();
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'whitelist');

    saveChinaIpBlockStateToFile({ enabled: false });
    invalidateChinaIpConfigCache();
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'disabled');

    // 镜像写坏时按关闭处理：一次坏文件不能把整站锁死。
    await fs.writeFile(getChinaIpBlockStateFile(), '{ not json');
    invalidateChinaIpConfigCache();
    assert.equal(evaluateChinaIpGate(makeRequest('/', { 'x-real-ip': CN_IP })).reason, 'disabled');
  } finally {
    process.chdir(originalCwd);
    await fs.rm(sandbox, { recursive: true, force: true });
    invalidateChinaIpConfigCache();
    loadChinaIpRanges(true);
  }

  // 回到真实工作目录：随代码发布的基线库必须真的在版本库里，
  // 否则一次纯净 checkout 的部署会静默地"拦截已开启但永不命中"。
  const baseline = getIpLibraryStatus();
  assert.equal(baseline.loaded, true);
  assert.ok(baseline.v4Ranges > 4000, `baseline v4 ranges: ${baseline.v4Ranges}`);
  assert.ok(baseline.v6Ranges > 2000, `baseline v6 ranges: ${baseline.v6Ranges}`);
});
