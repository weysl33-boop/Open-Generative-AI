import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UserDropdownMenu component follows Jimeng concise architecture without redundant items', async () => {
  const menuSource = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  // 1. 验证即梦风格的核心元素存在
  assert.ok(menuSource.includes('export default function UserDropdownMenu'), 'UserDropdownMenu must be exported');
  assert.ok(menuSource.includes('个人主页') || menuSource.includes('Profile'), 'Must have direct Profile link like Jimeng');
  assert.ok(menuSource.includes('ChevronRight'), 'Must use subtle right arrow for menu items');
  assert.ok(menuSource.includes('credits'), 'Must display credits balance cleanly');
  assert.ok(menuSource.includes('充值/升级') || menuSource.includes('Top up'), 'Must provide concise CTA button');

  // 2. 验证保留真实有效功能项
  assert.ok(menuSource.includes('/creations'), 'Must link to creations');
  assert.ok(menuSource.includes('/account'), 'Must link to account center');
  assert.ok(menuSource.includes('onOpenSettings'), 'Must support opening settings modal');
  assert.ok(menuSource.includes('toggleLanguage'), 'Must support language switching');
  assert.ok(menuSource.includes('handleLogoutClick'), 'Must handle safe logout');

  // 3. 验证剔除了图1中所有无用/冗余/未实现的占位功能
  const bannedRedundantTerms = [
    '新手漂移',
    '使用说明书',
    '常见问题',
    'AI 水印',
    '专属盒饭',
    'OiiOii CLI',
    'OiiOii Desktop',
    '邀请好友+200盒饭',
  ];
  for (const term of bannedRedundantTerms) {
    assert.ok(!menuSource.includes(term), `Menu must not contain redundant/unimplemented term: ${term}`);
  }

  // 4. 验证交互机制：点击外部关闭和ESC键支持
  assert.ok(menuSource.includes('handleClickOutside'), 'Must support click outside to close');
  assert.ok(menuSource.includes('handleKeyDown'), 'Must support Escape key to close');
});

test('StandaloneShell integrates UserDropdownMenu cleanly and removes external gear and language switcher', async () => {
  const shellSource = await readFile(new URL('../components/StandaloneShell.js', import.meta.url), 'utf8');

  assert.ok(shellSource.includes("import UserDropdownMenu from './UserDropdownMenu';"), 'StandaloneShell must import UserDropdownMenu');
  assert.ok(shellSource.includes('<UserDropdownMenu'), 'StandaloneShell must render UserDropdownMenu');
  assert.ok(shellSource.includes('onLogout={handleLogout}'), 'StandaloneShell must pass handleLogout');
  assert.ok(shellSource.includes("fetch('/api/auth/logout'"), 'handleLogout must call logout api');
  // 验证顶栏右侧移除了外露冗余的语言切换与设置齿轮
  assert.ok(!shellSource.includes('<LanguageSwitcher />'), 'StandaloneShell must not expose external LanguageSwitcher');
});

test('StudioHeader unifies width with homepage and removes redundant icons', async () => {
  const headerSource = await readFile(new URL('../components/site/StudioHeader.js', import.meta.url), 'utf8');

  assert.ok(headerSource.includes("import UserDropdownMenu from '@/components/UserDropdownMenu';"), 'StudioHeader must import UserDropdownMenu');
  assert.ok(headerSource.includes('<UserDropdownMenu'), 'StudioHeader must render UserDropdownMenu');
  // 验证导航宽度与首页一致（全宽铺满，不得使用 max-w-7xl 掐死宽度）
  assert.ok(!headerSource.includes('max-w-7xl'), 'StudioHeader must not constrain width to max-w-7xl');
  assert.ok(headerSource.includes('w-full'), 'StudioHeader must be full width');
  // 验证移除了外露冗余的语言切换与设置齿轮
  assert.ok(!headerSource.includes('<LanguageSwitcher'), 'StudioHeader must not expose external LanguageSwitcher');
});

test('StandaloneShell and error boundaries provide enterprise-grade resilience and avoid undefined pathname', async () => {
  const shellSource = await readFile(new URL('../components/StandaloneShell.js', import.meta.url), 'utf8');
  const rootErrorSource = await readFile(new URL('../app/error.js', import.meta.url), 'utf8');
  const studioErrorSource = await readFile(new URL('../app/studio/[[...slug]]/error.js', import.meta.url), 'utf8');

  // 1. 验证 StandaloneShell 严谨引入并解构 usePathname，杜绝 ReferenceError
  assert.ok(shellSource.includes("usePathname"), 'StandaloneShell must import usePathname from next/navigation');
  assert.ok(shellSource.includes("const pathname = usePathname() || '';"), 'StandaloneShell must safely extract pathname with fallback');

  // 2. 验证根级错误边界 app/error.js 存在且具备自愈尝试机制
  assert.ok(rootErrorSource.includes("'use client'"), 'Root error boundary must be a client component');
  assert.ok(rootErrorSource.includes("export default function ErrorBoundary"), 'Root error boundary must export ErrorBoundary');
  assert.ok(rootErrorSource.includes("reset()"), 'Root error boundary must support reset');
  assert.ok(rootErrorSource.includes("window.location.reload()"), 'Root error boundary must provide reload recovery');

  // 3. 验证工作台级错误边界 app/studio/[[...slug]]/error.js 存在且具备隔离能力
  assert.ok(studioErrorSource.includes("'use client'"), 'Studio error boundary must be a client component');
  assert.ok(studioErrorSource.includes("工作台遇到瞬态异常") || studioErrorSource.includes("Studio"), 'Studio error boundary must inform user');
  assert.ok(studioErrorSource.includes("reset()"), 'Studio error boundary must support reset');
});

