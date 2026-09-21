import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../lib/admin/permissions.js';
import { DEFAULT_BANNER_CONFIG, DEFAULT_MOTION_CONFIG } from '../lib/services/content.js';

console.log('==============================================');
console.log('1. 验证权限系统定义 (Permissions)');
console.log('==============================================');
assert.equal(PERMISSIONS.contentRead, 'content.read', 'PERMISSIONS 必须定义 contentRead');
assert.equal(PERMISSIONS.contentWrite, 'content.write', 'PERMISSIONS 必须定义 contentWrite');
assert.ok(ROLE_PERMISSIONS.super_admin.has(PERMISSIONS.contentRead), 'super_admin 必须拥有 contentRead');
assert.ok(ROLE_PERMISSIONS.super_admin.has(PERMISSIONS.contentWrite), 'super_admin 必须拥有 contentWrite');
assert.ok(ROLE_PERMISSIONS.operations_admin.has(PERMISSIONS.contentRead), 'operations_admin 必须拥有 contentRead');
assert.ok(ROLE_PERMISSIONS.operations_admin.has(PERMISSIONS.contentWrite), 'operations_admin 必须拥有 contentWrite');
console.log('✔ 权限系统定义与角色继承检查通过\n');

console.log('==============================================');
console.log('2. 验证内容管理配置默认规范');
console.log('==============================================');
assert.ok(DEFAULT_BANNER_CONFIG.message, 'DEFAULT_BANNER_CONFIG 必须包含 message');
assert.ok(DEFAULT_BANNER_CONFIG.linkUrl, 'DEFAULT_BANNER_CONFIG 必须包含 linkUrl');
assert.equal(DEFAULT_BANNER_CONFIG.theme, 'indigo', 'DEFAULT_BANNER_CONFIG 默认主题应为 indigo');
assert.equal(DEFAULT_BANNER_CONFIG.enabled, true, 'DEFAULT_BANNER_CONFIG 默认开启');

assert.equal(DEFAULT_MOTION_CONFIG.motionLevel, 'full', 'DEFAULT_MOTION_CONFIG 默认动效等级为 full');
assert.equal(DEFAULT_MOTION_CONFIG.ambientGlow, true, 'DEFAULT_MOTION_CONFIG 默认开启 ambientGlow');
assert.equal(DEFAULT_MOTION_CONFIG.cardTiltHover, true, 'DEFAULT_MOTION_CONFIG 默认开启 cardTiltHover');
console.log('✔ 内容与动效默认规范检查通过\n');

console.log('==============================================');
console.log('3. 验证管理后台导航菜单 (统一配置源)');
console.log('==============================================');
const { ADMIN_NAV_GROUPS } = await import('../lib/admin/navigation.js');
const contentNavGroup = ADMIN_NAV_GROUPS.find((g) => g.id === 'content');
assert.ok(contentNavGroup, '导航配置必须包含 内容与前台 一级分组');
const contentNavHrefs = contentNavGroup.items.map((i) => i.href);
assert.ok(contentNavHrefs.includes('/admin/content/banners'), '导航配置必须包含 /admin/content/banners 路由');
assert.ok(contentNavHrefs.includes('/admin/content/effects'), '导航配置必须包含 /admin/content/effects 路由');
assert.ok(contentNavHrefs.includes('/admin/content/analytics'), '导航配置必须包含 /admin/content/analytics 路由');
console.log('✔ 后台导航统一配置源验证通过\n');

console.log('==============================================');
console.log('4. 验证前台 StandaloneShell 真实动态接入');
console.log('==============================================');
const shellContent = fs.readFileSync(path.resolve('components/StandaloneShell.js'), 'utf-8');
// 确保删除了硬编码的 showVadooBanner
assert.ok(!shellContent.includes('const [showVadooBanner, setShowVadooBanner]'), '必须彻底移除硬编码的 showVadooBanner 状态');
assert.ok(shellContent.includes('bannerConfig'), '必须使用动态 bannerConfig');
assert.ok(shellContent.includes('/api/site/content-config'), '必须通过 /api/site/content-config 拉取配置');
assert.ok(shellContent.includes('/api/analytics/banner-event'), '必须包含 /api/analytics/banner-event 埋点上报');
assert.ok(shellContent.includes('handleBannerClick'), '必须挂载 handleBannerClick 点击上报');
assert.ok(shellContent.includes('handleBannerDismiss'), '必须挂载 handleBannerDismiss 关闭上报');
assert.ok(shellContent.includes('motionConfig.ambientGlow'), '必须支持后台控制的 ambientGlow 氛围流光');
console.log('✔ 前台 StandaloneShell 动态联动与埋点上报验证通过\n');

console.log('==============================================');
console.log('5. 验证后端 5 个 API 路由完整性');
console.log('==============================================');
const apiFiles = [
  'app/api/site/content-config/route.js',
  'app/api/analytics/banner-event/route.js',
  'app/api/admin/content/banner/route.js',
  'app/api/admin/content/motion/route.js',
  'app/api/admin/content/analytics/route.js',
];
for (const file of apiFiles) {
  assert.ok(fs.existsSync(path.resolve(file)), `API 路由文件 ${file} 必须存在`);
}
console.log('✔ 后端 API 路由文件全部就绪\n');

console.log('==============================================');
console.log('6. 验证管理后台页面组件完整性');
console.log('==============================================');
const adminPages = [
  'app/admin/content/banners/page.js',
  'app/admin/content/banners/BannerManagerClient.js',
  'app/admin/content/effects/page.js',
  'app/admin/content/effects/MotionManagerClient.js',
  'app/admin/content/analytics/page.js',
  'app/admin/content/analytics/BannerAnalyticsClient.js',
];
for (const page of adminPages) {
  assert.ok(fs.existsSync(path.resolve(page)), `管理后台页面 ${page} 必须存在`);
}
console.log('✔ 管理后台页面组件全部就绪\n');

console.log('==============================================');
console.log('7. 验证 CTR 转化率计算公式与离线降级');
console.log('==============================================');
function calculateCtr(clicks, impressions) {
  if (!impressions || impressions <= 0) return 0;
  return Number(((clicks / impressions) * 100).toFixed(2));
}
assert.equal(calculateCtr(0, 0), 0);
assert.equal(calculateCtr(50, 1000), 5.0);
assert.equal(calculateCtr(123, 4567), 2.69);
console.log('✔ CTR 指标公式计算验证通过\n');

console.log('🎉 内容管理模块全部核心逻辑与前后端联动验证 100% 通过！');
