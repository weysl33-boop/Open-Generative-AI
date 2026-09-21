import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 模拟加载环境变量与 server-only
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readCode(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('1. 前端品牌与导航服务层 (Branding Service) 规范测试', async () => {
  const {
    DEFAULT_BRAND_CONFIG,
    DEFAULT_NAV_CONFIG,
    getBrandConfig,
    getNavigationConfig,
    saveBrandConfig,
    saveNavigationConfig,
    resetBrandingToDefault,
  } = await import('../lib/services/branding.js');

  // 1.1 校验默认配置规范
  assert.equal(DEFAULT_BRAND_CONFIG.brandName, 'koyosim', '默认品牌名称应为 koyosim');
  assert.equal(DEFAULT_BRAND_CONFIG.logoType, 'icon', '默认 Logo 类型应为 icon');
  assert.equal(DEFAULT_BRAND_CONFIG.logoBgColor, '#22d3ee', '默认背景色应为 #22d3ee');
  assert.equal(DEFAULT_BRAND_CONFIG.logoHref, '/studio', '默认跳转路径应为 /studio');
  assert.ok(Array.isArray(DEFAULT_NAV_CONFIG), '默认导航配置必须为数组');
  assert.ok(DEFAULT_NAV_CONFIG.length >= 2, '默认导航配置项应至少包含 2 项');

  const mockActor = {
    id: 'admin_test_1',
    email: 'admin@koyosim.com',
    role: 'super_admin',
  };

  // 1.2 校验非法 URL 与 XSS 拦截
  const dangerousBrand = await saveBrandConfig({
    actor: mockActor,
    config: {
      brandName: 'koyosim',
      logoHref: 'javascript:alert(1)',
    },
    requestId: 'req_test_xss_1',
  });
  assert.ok(dangerousBrand.error, '必须拦截包含 javascript: 的非法 logoHref');

  const dangerousNav = await saveNavigationConfig({
    actor: mockActor,
    items: [
      {
        label: '恶意按钮',
        href: 'javascript:document.cookie',
        style: 'gradient',
      },
    ],
    requestId: 'req_test_xss_2',
  });
  assert.ok(dangerousNav.error, '必须拦截包含 javascript: 的非法导航 href');

  // 1.3 校验正常保存并读取落盘
  const saveBrandRes = await saveBrandConfig({
    actor: mockActor,
    config: {
      brandName: 'koyosim Studio Pro',
      brandSlogan: '企业级 AI 创作基座',
      logoType: 'icon',
      logoIcon: 'sparkles',
      logoBgColor: '#8b5cf6',
      logoTextColor: '#ffffff',
      logoHref: '/studio',
      logoTarget: '_self',
      showBrandName: true,
    },
    requestId: 'req_test_save_1',
  });
  assert.ok(!saveBrandRes.error, '正常保存品牌不应报错');
  assert.equal(saveBrandRes.data.brandName, 'koyosim Studio Pro');
  assert.equal(saveBrandRes.data.logoBgColor, '#8b5cf6');

  // 读取并确认生效
  const loadedBrand = await getBrandConfig();
  assert.equal(loadedBrand.brandName, 'koyosim Studio Pro');
  assert.equal(loadedBrand.logoIcon, 'sparkles');

  // 1.4 测试一键恢复默认
  const resetRes = await resetBrandingToDefault({
    actor: mockActor,
    requestId: 'req_test_reset_1',
  });
  assert.ok(!resetRes.error, '一键恢复默认不应报错');
  assert.equal(resetRes.brand.brandName, 'koyosim');
  assert.equal(resetRes.brand.logoBgColor, '#22d3ee');

  const restoredBrand = await getBrandConfig();
  assert.equal(restoredBrand.brandName, 'koyosim');
});

test('2. 管理后台与前端界面组件集成审计', async () => {
  // 2.1 检查 AdminNav 导航注册（菜单已收敛到单一配置源 lib/admin/navigation.js）
  const { ADMIN_NAV_GROUPS } = await import('../lib/admin/navigation.js');
  const contentGroup = ADMIN_NAV_GROUPS.find((g) => g.id === 'content');
  assert.ok(contentGroup, '导航配置缺少内容与前台分组');
  const brandingItem = contentGroup.items.find((i) => i.href === '/admin/content/branding');
  assert.ok(brandingItem, '导航配置必须注册 /admin/content/branding 路由');
  assert.equal(brandingItem.label, '站点与导航', '站点与导航菜单标签应存在于统一配置源');

  // 2.2 检查系统设置页面的引导卡片
  const settingsEditorCode = readCode('app/admin/settings/SettingsEditor.js');
  assert.match(settingsEditorCode, /\/admin\/content\/branding/, 'SettingsEditor 必须包含通往前端Logo与导航的链接');

  // 2.3 检查前台 StudioHeader 的动态驱动
  const headerCode = readCode('components/site/StudioHeader.js');
  assert.match(headerCode, /useBranding/, 'StudioHeader 必须引入并使用 useBranding');
  assert.match(headerCode, /DynamicVectorIcon/, 'StudioHeader 必须实现 DynamicVectorIcon 矢量图标渲染');
  assert.match(headerCode, /DynamicNavIcon/, 'StudioHeader 必须实现 DynamicNavIcon 导航图标渲染');
  assert.match(headerCode, /navigation\s*\.filter/, 'StudioHeader 必须动态遍历 enabled 导航菜单项');

  // 2.4 检查前台核心 StandaloneShell 的动态驱动
  const shellCode = readCode('components/StandaloneShell.js');
  assert.match(shellCode, /useBranding/, 'StandaloneShell 必须引入并使用 useBranding');
  assert.match(shellCode, /siteBrand\?\.logoBgColor/, 'StandaloneShell 必须动态绑定 siteBrand 徽标底色');
  assert.match(shellCode, /siteNavigation/, 'StandaloneShell 必须动态读取 siteNavigation 菜单列表');
  assert.match(shellCode, /DynamicNavIcon/, 'StandaloneShell 必须使用 DynamicNavIcon 动态渲染图标');
});

test('3. API 路由与权限定义审计', async () => {
  const publicApiCode = readCode('app/api/site/branding/route.js');
  assert.match(publicApiCode, /getBrandConfig/, '公开 API 必须调用 getBrandConfig');
  assert.match(publicApiCode, /getNavigationConfig/, '公开 API 必须调用 getNavigationConfig');
  assert.match(publicApiCode, /Cache-Control/, '公开 API 必须提供缓存头以保证高响应性能');

  const adminApiCode = readCode('app/api/admin/content/branding/route.js');
  assert.match(adminApiCode, /PERMISSIONS\.contentRead/, '管理端 GET 必须校验 contentRead 权限');
  assert.match(adminApiCode, /PERMISSIONS\.contentWrite/, '管理端 POST 必须校验 contentWrite 权限');
  assert.match(adminApiCode, /getRequiredIdempotencyKey/, '管理端 POST 必须强制校验 Idempotency-Key');
  assert.match(adminApiCode, /resetBrandingToDefault/, '管理端必须支持一键恢复预设 action');
});
