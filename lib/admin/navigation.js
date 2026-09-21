/**
 * 运营管理后台导航唯一配置源。
 * Sidebar / Breadcrumb / 权限过滤 / 旧路由重定向 / 路由契约测试全部由此生成。
 * 本文件必须保持纯数据 + 纯函数（不 import React / server-only），
 * 以便客户端组件与 Node 测试脚本共用。
 */

export const ADMIN_NAV_GROUPS = [
  {
    id: 'dashboard',
    label: '工作台',
    icon: 'LayoutDashboard',
    items: [
      { id: 'ops-overview', href: '/admin', label: '运营概览', permission: 'dashboard.read' },
    ],
  },
  {
    id: 'users-access',
    label: '用户与权限',
    icon: 'Users',
    items: [
      { id: 'users', href: '/admin/users', label: '用户管理', permission: 'users.read', detailLabel: '用户详情' },
      { id: 'admins', href: '/admin/admins', label: '管理员与角色', permission: 'admins.write' },
      { id: 'sessions', href: '/admin/security/sessions', label: '会话与安全', permission: 'sessions.revoke' },
    ],
  },
  {
    id: 'billing',
    label: '订阅与计费',
    icon: 'CreditCard',
    items: [
      { id: 'subscriptions', href: '/admin/subscriptions', label: '订阅管理', permission: 'billing.read' },
      { id: 'orders', href: '/admin/orders', label: '订单与支付', permission: 'billing.read' },
      { id: 'credits-ledger', href: '/admin/credits', label: '积分 / 额度账本', permission: 'credits.read' },
      { id: 'plans', href: '/admin/plans', label: '套餐与定价', permission: 'plans.read' },
      { id: 'coupons', href: '/admin/coupons', label: '卡密与兑换码', permission: 'coupons.read' },
      { id: 'payment-channels', href: '/admin/providers/payments', label: '支付渠道', permission: 'providers.read' },
      { id: 'subscription-faq', href: '/admin/subscription-faq', label: '订阅说明', permission: 'plans.read' },
    ],
  },
  {
    id: 'generation',
    label: '生成运营',
    icon: 'Clapperboard',
    items: [
      { id: 'generations', href: '/admin/generations', label: '生成任务', permission: 'generations.read' },
      { id: 'generation-failures', href: '/admin/generations/failures', label: '失败任务', permission: 'generations.read' },
      { id: 'moderation', href: '/admin/moderation', label: '内容审核', permission: 'moderation.read' },
    ],
  },
  {
    id: 'ai-models',
    label: 'AI 模型与路由',
    icon: 'Cpu',
    items: [
      { id: 'ai-providers', href: '/admin/models/providers', label: 'AI 供应商', permission: 'providers.read' },
      { id: 'model-catalog', href: '/admin/models/catalog', label: '模型目录', permission: 'models.read' },
      { id: 'model-routing', href: '/admin/models/routing', label: '智能路由', permission: 'models.read' },
      { id: 'model-control', href: '/admin/models', label: '模型开关与成本', permission: 'models.read' },
      { id: 'model-pricing', href: '/admin/models/pricing', label: '动态计价', permission: 'models.read' },
      { id: 'channel-health', href: '/admin/models/health', label: '通道健康', permission: 'providers.read' },
    ],
  },
  {
    id: 'content',
    label: '内容与前台',
    icon: 'Megaphone',
    items: [
      { id: 'site-branding', href: '/admin/content/branding', label: '站点与导航', permission: 'content.read' },
      { id: 'banners', href: '/admin/content/banners', label: 'Banner 管理', permission: 'content.read' },
      { id: 'home-motion', href: '/admin/content/effects', label: '首页视觉', permission: 'content.read' },
      { id: 'click-analytics', href: '/admin/content/analytics', label: '点击分析', permission: 'content.read' },
    ],
  },
  {
    id: 'login-config',
    label: '登录配置',
    icon: 'Plug2',
    items: [
      { id: 'social-login', href: '/admin/providers/social', label: '社交登录', permission: 'providers.read' },
      { id: 'sms-providers', href: '/admin/providers/sms', label: '短信登录', permission: 'providers.read' },
    ],
  },
  {
    id: 'integrations',
    label: '系统集成',
    icon: 'Plug2',
    items: [
      { id: 'email-sending', href: '/admin/email', label: '邮件发信设置', permission: 'providers.read' },
      { id: 'webhooks', href: '/admin/webhooks', label: 'Webhook 事件', permission: 'webhooks.read' },
    ],
  },
  {
    id: 'finance',
    label: '财务与成本',
    icon: 'Wallet',
    items: [
      { id: 'cost-center', href: '/admin/models/cost-center', label: 'AI 成本中心', permission: 'models.read' },
      { id: 'profit-center', href: '/admin/models/profit-center', label: 'AI 利润中心', permission: 'models.read' },
    ],
  },
  {
    id: 'system',
    label: '系统与安全',
    icon: 'Shield',
    items: [
      { id: 'health', href: '/admin/health', label: '系统健康', permission: 'health.read' },
      { id: 'settings', href: '/admin/settings', label: '系统设置', permission: 'settings.read' },
      { id: 'i18n', href: '/admin/i18n', label: '语言管理', permission: 'i18n.read' },
      { id: 'audit', href: '/admin/audit', label: '审计日志', permission: 'audit.read' },
    ],
  },
];

/**
 * 旧路由 → 新路由。仅做页内 redirect()，不删文件、不进菜单。
 * /admin/providers/ai 保留原页面：它仍是 env 型供应商密钥轮换的唯一入口。
 * 邮箱 SMTP 不再是登录方式，独立成 /admin/email 单页设置。
 */
export const ADMIN_LEGACY_REDIRECTS = {
  '/admin/providers': '/admin/models/providers',
  '/admin/providers/models': '/admin/models',
  '/admin/providers/email': '/admin/email',
};

/** 不进入菜单、但真实存在且需保留的后台路由（403/404/遗留功能页）。 */
export const ADMIN_NONAV_ROUTES = {
  '/admin/forbidden': '403 无权限提示页',
  '/admin/providers/ai': '旧版 env 供应商密钥管理，待数据并入 DB 供应商中台后下线',
};

function segmentsOf(href) {
  return href.split('/').filter(Boolean);
}

/**
 * 最长前缀匹配：/admin/models/catalog 命中 model-catalog 而非 model-control；
 * /admin/users/123 命中 users；/admin/users-permissions 不命中 users。
 */
export function matchAdminRoute(pathname) {
  if (ADMIN_NONAV_ROUTES[pathname]) return null;
  const path = segmentsOf(pathname || '/');
  let best = null;
  let bestGroup = null;

  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const target = segmentsOf(item.href);
      if (target.length > path.length) continue;
      const isPrefix = target.every((seg, i) => seg === path[i]);
      if (!isPrefix) continue;
      if (!best || target.length > segmentsOf(best.href).length) {
        best = item;
        bestGroup = group;
      }
    }
  }

  if (!best) return null;
  return {
    group: bestGroup,
    item: best,
    rest: path.slice(segmentsOf(best.href).length),
  };
}

/** 当前路径是否应高亮某个菜单项（供 Sidebar 使用）。 */
export function isItemActive(item, pathname) {
  const matched = matchAdminRoute(pathname);
  return Boolean(matched && matched.item.id === item.id);
}

/**
 * 面包屑轨迹：组（无独立页面，不可点）→ 页面 →（可选）详情层。
 * 返回 [{ label, href|null }]，href 为 null 表示不可点（当前页或无 Overview 的父级）。
 */
export function getAdminBreadcrumbs(pathname) {
  const matched = matchAdminRoute(pathname);
  if (!matched) return null;
  const { group, item, rest } = matched;

  const crumbs = [
    { label: group.label, href: null },
    { label: item.label, href: item.href },
  ];
  if (rest.length > 0) {
    crumbs.push({
      label: item.detailLabel || rest[0],
      href: null,
    });
  } else {
    crumbs[crumbs.length - 1] = { label: item.label, href: null };
  }
  return crumbs;
}

/** 开发环境路由自检：菜单 href 缺失页面时由调用方 console.error。 */
export function walkAdminNav(fn) {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) fn(group, item);
  }
}
