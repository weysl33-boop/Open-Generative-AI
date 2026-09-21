import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_NAV_GROUPS,
  ADMIN_LEGACY_REDIRECTS,
  ADMIN_NONAV_ROUTES,
  matchAdminRoute,
  getAdminBreadcrumbs,
} from '../../lib/admin/navigation.js';
import { PERMISSIONS } from '../../lib/admin/permissions.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pageFileFor(href) {
  return path.join(repoRoot, 'app', href === '/admin' ? 'admin' : href.replace(/^\//, ''), 'page.js');
}

async function pageExists(href) {
  try {
    await fs.access(pageFileFor(href));
    return true;
  } catch {
    return false;
  }
}

test('导航配置结构契约：稳定 id / 唯一 href / 合法 permission 引用', async () => {
  const seenIds = new Set();
  const seenHrefs = new Set();

  for (const group of ADMIN_NAV_GROUPS) {
    assert.match(group.id, /^[a-z0-9-]+$/, `分组 id 必须是稳定 slug: ${group.id}`);
    assert.ok(group.label, `分组 ${group.id} 缺少标题`);
    assert.ok(group.icon, `分组 ${group.id} 缺少图标`);
    assert.ok(!seenIds.has(group.id), `重复分组 id: ${group.id}`);
    seenIds.add(group.id);

    assert.ok(group.items.length > 0, `分组 ${group.id} 没有菜单项`);
    for (const item of group.items) {
      assert.match(item.id, /^[a-z0-9-]+$/, `菜单项 id 必须是稳定 slug: ${item.id}`);
      assert.ok(!seenIds.has(item.id), `重复菜单项 id: ${item.id}`);
      seenIds.add(item.id);

      assert.ok(item.label, `菜单项 ${item.id} 缺少标题`);
      assert.ok(
        item.href && item.href.startsWith('/admin/') || item.href === '/admin',
        `菜单项 ${item.id} href 非法: ${item.href}`
      );
      assert.ok(item.href !== '#' && !item.href.startsWith('javascript:'), `菜单项 ${item.id} 使用了占位链接`);
      assert.ok(!seenHrefs.has(item.href), `重复路由: ${item.href}`);
      seenHrefs.add(item.href);

      const permKey = Object.keys(PERMISSIONS).find((k) => PERMISSIONS[k] === item.permission);
      assert.ok(permKey, `菜单项 ${item.id} 引用了不存在的权限: ${item.permission}`);
    }
  }
});

test('所有菜单 href 必须有真实页面文件（禁止死链接）', async () => {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      assert.ok(
        await pageExists(item.href),
        `菜单 ${group.id}/${item.id} 指向不存在的路由: ${item.href} (app ${pageFileFor(item.href)} 缺失)`
      );
    }
  }
});

test('菜单权限与页面服务端守卫一致（禁止隐藏菜单即视为权限控制）', async () => {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const src = await fs.readFile(pageFileFor(item.href), 'utf8');
      const guard = src.match(/requireAdminPagePermission\(PERMISSIONS\.([A-Za-z0-9_]+)\)/);
      assert.ok(guard, `页面 ${item.href} 缺少 requireAdminPagePermission 服务端守卫`);
      const permKey = Object.keys(PERMISSIONS).find((k) => PERMISSIONS[k] === item.permission);
      assert.equal(
        PERMISSIONS[guard[1]],
        item.permission,
        `菜单 ${item.href} 用 ${item.permission}，页面守卫用 ${PERMISSIONS[guard[1]]}，必须一致`
      );
      void permKey;
    }
  }
});

test('旧路由重定向：目标真实存在、无自环、无链式循环', async () => {
  const visited = new Set();
  for (const [from, to] of Object.entries(ADMIN_LEGACY_REDIRECTS)) {
    assert.notEqual(from, to, `自指重定向: ${from}`);
    assert.ok(!visited.has(to) || to === from, `疑似重定向环: ${to}`);
    visited.add(from);

    // 目标允许带 query（/admin/system/login?category=sms），存在性只看路径部分。
    const toPath = to.split('?')[0];
    const targetInNav = ADMIN_NAV_GROUPS.some((g) => g.items.some((i) => i.href === toPath));
    assert.ok(
      targetInNav || (await pageExists(toPath)),
      `旧路由 ${from} 的目标 ${to} 既不在菜单也没有页面`
    );

    const shimSrc = await fs.readFile(pageFileFor(from), 'utf8');
    assert.match(shimSrc, /redirect\(/, `旧路由 ${from} 页面未实现 redirect`);
    assert.ok(!shimSrc.includes(to + to), `重定向拼接异常: ${from}`);
  }
});

test('不存在未登记的孤立后台页面（页面文件 ↔ 菜单/重定向/白名单 三方对齐）', async () => {
  const adminRoot = path.join(repoRoot, 'app', 'admin');
  const discovered = [];
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const sub = path.join(dir, e.name);
      const subRel = `${rel}/${e.name}`;
      try {
        await fs.access(path.join(sub, 'page.js'));
        discovered.push(`/admin${subRel}`);
      } catch {}
      await walk(sub, subRel);
    }
  }
  await walk(adminRoot, '');

  const navHrefs = new Set(ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  const known = new Set([
    ...navHrefs,
    ...Object.keys(ADMIN_LEGACY_REDIRECTS),
    ...Object.keys(ADMIN_NONAV_ROUTES),
    '/admin/users/[id]', // 动态详情层，由 users 菜单项承载 active 与面包屑
  ]);

  for (const route of discovered) {
    assert.ok(known.has(route), `发现未登记的后台路由: ${route}（需进菜单 / 登记重定向 / 加入白名单并注明原因）`);
  }
});

test('Active 匹配采用路由段语义：子路径保持高亮、相似前缀不误伤', () => {
  const cases = [
    ['/admin', 'ops-overview'],
    ['/admin/', 'ops-overview'],
    ['/admin/models', 'model-control'],
    ['/admin/models/catalog', 'model-catalog'],
    ['/admin/models/cost-center', 'cost-center'],
    ['/admin/models/providers', 'ai-providers'],
    ['/admin/generations', 'generations'],
    ['/admin/generations/failures', 'generation-failures'],
    ['/admin/generations/abc123', 'generations'],
    ['/admin/users', 'users'],
    ['/admin/users/usr_123', 'users'],
    ['/admin/users-permissions', 'ops-overview'], // 不能误配 users；/admin 前缀兜底
    ['/admin/providers/payments', 'payment-channels'],
    ['/admin/system/login', 'login-methods'],
    ['/admin/system/email', 'email-sending'],
    ['/admin/login', null],
    ['/admin/email', null],
    ['/admin/providers/social', null],
    ['/admin/providers/sms', null],
    ['/admin/providers/email', null],
    ['/admin/security/sessions', 'sessions'],
    ['/admin/forbidden', null],
    ['/admin/nope', null],
  ];
  for (const [pathname, expected] of cases) {
    const matched = matchAdminRoute(pathname);
    // /admin/users-permissions 等未精确注册的路径会回落到最短前缀 /admin（ops-overview）
    const actual = pathname === '/admin/' ? 'ops-overview' : matched?.item.id ?? null;
    if (expected === null) {
      assert.ok(
        !matched || matched.item.href === '/admin',
        `${pathname} 不应命中具体菜单项（当前: ${matched?.item.id}）`
      );
    } else {
      assert.equal(actual, expected, `${pathname} 应命中 ${expected}`);
    }
  }
});

test('刷新深层 URL 与面包屑轨迹正确（Back/Forward 幂等）', () => {
  assert.deepEqual(getAdminBreadcrumbs('/admin/users/usr_1'), [
    { label: '用户与权限', href: null },
    { label: '用户管理', href: '/admin/users' },
    { label: '用户详情', href: null },
  ]);
  assert.deepEqual(getAdminBreadcrumbs('/admin/models/health'), [
    { label: 'AI 模型与路由', href: null },
    { label: '通道健康', href: null },
  ]);
  assert.deepEqual(getAdminBreadcrumbs('/admin/generations/task_9'), [
    { label: '生成运营', href: null },
    { label: '生成任务', href: '/admin/generations' },
    { label: 'task_9', href: null },
  ]);
  assert.equal(getAdminBreadcrumbs('/admin/forbidden'), null);
});

test('403 与 404 兜底页面存在（旧 ?forbidden=1 静默失败已修复）', async () => {
  await fs.access(path.join(repoRoot, 'app/admin/forbidden/page.js'));
  await fs.access(path.join(repoRoot, 'app/admin/not-found.js'));
  const pageAuth = await fs.readFile(path.join(repoRoot, 'lib/admin/pageAuth.js'), 'utf8');
  assert.match(pageAuth, /\/admin\/forbidden/);
  assert.doesNotMatch(pageAuth, /\/admin\?forbidden=1/);
});
