import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readCode(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('AdminNav renders config-driven two-level collapsible navigation with smooth slide-down animation', async () => {
  const { ADMIN_NAV_GROUPS } = await import('../../lib/admin/navigation.js');
  const content = await readCode('components/admin/AdminNav.js');

  // 单一配置源：菜单渲染必须来自 ADMIN_NAV_GROUPS，而非组件内手写
  assert.ok(ADMIN_NAV_GROUPS.length >= 9, '九大业务域应在配置源中齐备');
  assert.match(content, /ADMIN_NAV_GROUPS/);
  assert.match(content, /matchAdminRoute/);

  // 一级分组图标（lucide 单一图标体系）
  assert.match(content, /LayoutDashboard/);
  assert.match(content, /Users/);
  assert.match(content, /CreditCard/);
  assert.match(content, /Clapperboard/);
  assert.match(content, /Cpu/);
  assert.match(content, /Megaphone/);
  assert.match(content, /Plug2/);
  assert.match(content, /Wallet/);
  assert.match(content, /Shield/);
  assert.match(content, /ChevronDown/);

  // 下滑折叠与状态维护（以稳定 id 为键）
  assert.match(content, /openGroups/);
  assert.match(content, /toggleGroup/);
  assert.match(content, /grid-rows-\[1fr\]/);
  assert.match(content, /grid-rows-\[0fr\]/);

  // 折叠 rail 与可访问性
  assert.match(content, /aria-expanded/);
  assert.match(content, /aria-current/);

  // 配置源包含各主要二级路由
  const hrefs = new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  for (const href of [
    '/admin',
    '/admin/users',
    '/admin/admins',
    '/admin/security/sessions',
    '/admin/subscriptions',
    '/admin/orders',
    '/admin/credits',
    '/admin/coupons',
    '/admin/plans',
    '/admin/generations',
    '/admin/models',
    '/admin/health',
    '/admin/audit',
  ]) {
    assert.ok(hrefs.has(href), `菜单配置缺少路由 ${href}`);
  }
});

test('AdminScrollableTabs provides horizontal drag-to-scroll, wheel, and fade mask', async () => {
  const content = await readCode('components/admin/AdminScrollableTabs.js');
  // 核心滑动特性
  assert.match(content, /scrollLeft/);
  assert.match(content, /handleWheel/);
  assert.match(content, /handleMouseDown/);
  assert.match(content, /handleMouseMove/);
  assert.match(content, /handleMouseUp/);
  assert.match(content, /canScrollLeft/);
  assert.match(content, /canScrollRight/);
  assert.match(content, /scrollIntoView/);
  assert.match(content, /no-scrollbar/);
});

test('UserDetailTabs embeds AdminScrollableTabs for horizontal scrollable tab navigation', async () => {
  const content = await readCode('app/admin/users/[id]/UserDetailTabs.js');
  assert.match(content, /import AdminScrollableTabs from '@\/components\/admin\/AdminScrollableTabs'/);
  assert.match(content, /<AdminScrollableTabs/);
});

test('AdminShell uses optimized dark slim scrollbars without raw windows scrollbars', async () => {
  const content = await readCode('components/admin/AdminShell.js');
  assert.match(content, /admin-sidebar-scrollbar/);
});

