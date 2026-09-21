import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readCode(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('Admin navigation config includes social login route under 登录配置', async () => {
  const content = await readCode('components/admin/AdminNav.js');
  const sharedNavigationExists = await fs.access(path.join(repoRoot, 'lib/admin/navigation.js')).then(() => true, () => false);
  if (sharedNavigationExists) {
    assert.match(content, /ADMIN_NAV_GROUPS/);
    const { ADMIN_NAV_GROUPS } = await import('../../lib/admin/navigation.js');
    const loginConfig = ADMIN_NAV_GROUPS.find((group) => group.id === 'login-config');
    assert.ok(loginConfig, '缺少登录配置分组');
    const social = loginConfig.items.find((item) => item.href === '/admin/providers/social');
    assert.ok(social, '登录配置缺少社交登录菜单');
    assert.equal(social.label, '社交登录');
    assert.ok(loginConfig.items.some((item) => item.href === '/admin/providers/sms'), '登录配置缺少短信登录菜单');
    assert.ok(
      !loginConfig.items.some((item) => item.href === '/admin/providers/email'),
      '邮箱 SMTP 已独立为发信设置页，不应再出现在登录配置分组'
    );
    const integrations = ADMIN_NAV_GROUPS.find((group) => group.id === 'integrations');
    assert.ok(
      integrations?.items.some((item) => item.href === '/admin/email'),
      '系统集成缺少邮件发信设置菜单'
    );
  } else {
    assert.match(content, /label:\s*'登录配置'/);
    for (const href of ['/admin/providers/social', '/admin/providers/sms']) {
      assert.ok(content.includes(href), `登录配置缺少 ${href}`);
    }
  }
});

test('Providers service defines international and mainland social providers with distinct callbacks', async () => {
  const content = await readCode('lib/services/providers.js');
  assert.match(content, /id:\s*'google'/);
  assert.match(content, /id:\s*'x'/);
  assert.match(content, /id:\s*'tiktok'/);
  assert.match(content, /id:\s*'wechat_oauth'/);
  assert.match(content, /id:\s*'qq'/);
  assert.match(content, /id:\s*'douyin'/);
  assert.match(content, /kind:\s*'social'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/google\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/x\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/tiktok\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/wechat\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/qq\/callback'/);
  assert.match(content, /callbackPath:\s*'\/api\/auth\/oauth\/douyin\/callback'/);
  assert.match(content, /wechat_oauth:app_secret/);
});

test('lib/oauth.js supports dynamic credentials from encrypted database', async () => {
  const content = await readCode('lib/oauth.js');
  assert.match(content, /export async function getResolvedOAuthConfig/);
  assert.match(content, /export async function isOAuthProviderConfigured/);
  assert.match(content, /credentialProvider: 'google'/);
  assert.match(content, /credentialProvider: 'x'/);
  assert.match(content, /credentialProvider: 'tiktok'/);
  assert.match(content, /credentialProvider: 'wechat_oauth'/);
  assert.match(content, /credentialNames: \{ clientId: 'app_id', clientSecret: 'app_secret' \}/);
});

test('OAuth route uses resolved dynamic config before redirecting', async () => {
  const content = await readCode('app/api/auth/oauth/[provider]/route.js');
  assert.match(content, /getResolvedOAuthConfig/);
  assert.match(content, /await buildAuthorizationUrl/);
});

test('Secret PUT route supports batch secrets update for client_id and client_secret', async () => {
  const content = await readCode('app/api/admin/providers/[id]/secret/route.js');
  assert.match(content, /body\.secrets/);
  assert.match(content, /rotateProviderSecret/);
});

test('Social providers admin page and card component exist and are well structured', async () => {
  const pageContent = await readCode('app/admin/providers/social/page.js');
  const cardContent = await readCode('app/admin/providers/social/SocialProviderCard.js');
  assert.match(pageContent, /SocialProvidersPage/);
  assert.match(pageContent, /kind === 'social'/);
  assert.match(cardContent, /SocialProviderCard/);
  assert.match(cardContent, /一键复制/);
  assert.match(cardContent, /网关可达性探针/);
  assert.match(cardContent, /配置密钥 \/ 轮换/);
  // 确认已彻底删除管理员二次密码字段
  assert.doesNotMatch(cardContent, /adminPassword/);
});

test('Providers repo encryption key has multi-level fallback and uses ops_bill schema', async () => {
  const repoContent = await readCode('lib/repositories/providers.js');
  assert.match(repoContent, /ADMIN_SECRET_KEY/);
  assert.match(repoContent, /BILLING_SESSION_SECRET/);
  assert.match(repoContent, /ops_bill\.provider_secrets/);
  assert.match(repoContent, /ops_bill\.provider_health_checks/);
});

test('Health check probes in SocialProviderCard and ProviderCard include Idempotency-Key and error handling', async () => {
  const socialCard = await readCode('app/admin/providers/social/SocialProviderCard.js');
  const genericCard = await readCode('app/admin/providers/ProviderCard.js');
  const secretRoute = await readCode('app/api/admin/providers/[id]/secret/route.js');
  
  // 确认两个卡片的 runTest 均注入 Idempotency-Key
  assert.match(socialCard, /Idempotency-Key/);
  assert.match(genericCard, /Idempotency-Key/);
  
  // 确认 SocialProviderCard 具有已托管存盘感知
  assert.match(socialCard, /已托管存盘/);
  
  // 确认 secret 保存成功后自动触发 testProviderHealth
  assert.match(secretRoute, /testProviderHealth/);
});
