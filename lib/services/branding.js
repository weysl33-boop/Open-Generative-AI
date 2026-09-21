import 'server-only';

import { withTransaction } from '../db/index.js';
import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { logAudit } from '../admin/audit.js';

export const DEFAULT_BRAND_CONFIG = {
  brandName: 'koyosim',
  brandSlogan: 'AI 创意工作室',
  logoType: 'image', // 'image' | 'icon' | 'text_only'
  logoUrl: '',
  logoIcon: 'layers', // 'layers' | 'sparkles' | 'wand' | 'zap' | 'cube'
  logoBgColor: '#22d3ee',
  logoTextColor: '#000000',
  logoHref: '/studio',
  logoTarget: '_self',
  showBrandName: true,
};

export const DEFAULT_NAV_CONFIG = [];

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_URL_REGEX = /^(\/|https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/i;
const DANGEROUS_PROTOCOLS = /^(javascript|vbscript):/i;

/**
 * 获取当前生效的品牌与 Logo 配置
 */
export async function getBrandConfig() {
  try {
    const row = await getSettingByKey('site_brand');
    if (!row?.value || typeof row.value !== 'object') {
      return { ...DEFAULT_BRAND_CONFIG };
    }
    return {
      ...DEFAULT_BRAND_CONFIG,
      ...row.value,
    };
  } catch (err) {
    console.error('[branding] getBrandConfig fallback:', err?.message || err);
    return { ...DEFAULT_BRAND_CONFIG };
  }
}

/**
 * 获取当前生效的顶栏导航菜单项列表
 */
export async function getNavigationConfig() {
  try {
    const row = await getSettingByKey('site_navigation');
    if (!row?.value || !Array.isArray(row.value)) {
      return [...DEFAULT_NAV_CONFIG];
    }
    // 按照 order 升序排序
    return [...row.value].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  } catch (err) {
    console.error('[branding] getNavigationConfig fallback:', err?.message || err);
    return [...DEFAULT_NAV_CONFIG];
  }
}

/**
 * 保存品牌与 Logo 配置
 */
export async function saveBrandConfig({ actor, config, requestId }) {
  if (!actor?.email) {
    return { error: '未提供有效操作员身份' };
  }

  const brandName = String(config?.brandName || 'koyosim').trim();
  if (!brandName || brandName.length > 50) {
    return { error: '品牌名称不能为空且不得超过 50 个字符' };
  }

  const logoType = ['icon', 'image', 'text_only'].includes(config?.logoType)
    ? config.logoType
    : 'icon';

  const logoBgColor = config?.logoBgColor && HEX_COLOR_REGEX.test(config.logoBgColor)
    ? config.logoBgColor
    : '#22d3ee';

  const logoTextColor = config?.logoTextColor && HEX_COLOR_REGEX.test(config.logoTextColor)
    ? config.logoTextColor
    : '#000000';

  const logoHref = String(config?.logoHref || '/studio').trim();
  if (DANGEROUS_PROTOCOLS.test(logoHref) || !SAFE_URL_REGEX.test(logoHref)) {
    return { error: 'Logo 链接必须是以 / 开头的内部路由或以 https:// 开头的外部链接' };
  }

  let logoUrl = String(config?.logoUrl || '').trim();
  if (logoUrl && (DANGEROUS_PROTOCOLS.test(logoUrl) || !SAFE_URL_REGEX.test(logoUrl))) {
    return { error: '自定义 Logo 图片地址必须是以 / 开头的相对路径、https:// 链接或安全 base64 图片' };
  }

  const cleanConfig = {
    brandName,
    brandSlogan: String(config?.brandSlogan || '').trim().slice(0, 100),
    logoType,
    logoUrl,
    logoIcon: ['layers', 'sparkles', 'wand', 'zap', 'cube'].includes(config?.logoIcon)
      ? config.logoIcon
      : 'layers',
    logoBgColor,
    logoTextColor,
    logoHref,
    logoTarget: config?.logoTarget === '_blank' ? '_blank' : '_self',
    showBrandName: Boolean(config?.showBrandName ?? true),
  };

  return await withTransaction(async (tx) => {
    const existing = await getSettingByKey('site_brand', tx);
    const updated = await updateSettingValue({
      key: 'site_brand',
      value: cleanConfig,
      updatedBy: actor.email,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'branding.update_brand',
      targetType: 'system_setting',
      targetId: 'site_brand',
      riskLevel: 'medium',
      before: existing ? existing.value : null,
      after: cleanConfig,
      requestId,
      transaction: tx,
    });

    return { data: updated.value };
  });
}

/**
 * 保存顶栏导航菜单配置
 */
export async function saveNavigationConfig({ actor, items, requestId }) {
  if (!actor?.email) {
    return { error: '未提供有效操作员身份' };
  }

  if (!Array.isArray(items)) {
    return { error: '导航菜单配置必须为列表数组' };
  }

  if (items.length > 20) {
    return { error: '前台顶栏导航按钮最多支持配置 20 个项目' };
  }

  const cleanedItems = [];
  const ALLOWED_ICONS = ['flame', 'folder', 'workflow', 'bot', 'zap', 'sparkles', 'compass', 'external', 'none'];
  const ALLOWED_STYLES = ['gradient', 'subtle', 'primary', 'outline'];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = String(item?.label || '').trim();
    if (!label) {
      return { error: `第 ${i + 1} 个菜单按钮的名称不能为空` };
    }
    if (label.length > 30) {
      return { error: `菜单按钮 "${label}" 名称长度不得超过 30 字符` };
    }

    const href = String(item?.href || '').trim();
    if (!href || DANGEROUS_PROTOCOLS.test(href) || !SAFE_URL_REGEX.test(href)) {
      return { error: `菜单按钮 "${label}" 的跳转地址非法，必须是以 / 开头的内部路由或 https:// 安全链接` };
    }

    cleanedItems.push({
      id: item?.id ? String(item.id).trim().slice(0, 50) : `nav_${Date.now()}_${i}`,
      label,
      labelEn: String(item?.labelEn || '').trim().slice(0, 50),
      href,
      icon: ALLOWED_ICONS.includes(item?.icon) ? item.icon : 'none',
      iconColor: item?.iconColor && HEX_COLOR_REGEX.test(item.iconColor) ? item.iconColor : '#22d3ee',
      style: ALLOWED_STYLES.includes(item?.style) ? item.style : 'subtle',
      badge: String(item?.badge || '').trim().slice(0, 10),
      enabled: Boolean(item?.enabled ?? true),
      target: item?.target === '_blank' ? '_blank' : '_self',
      order: typeof item?.order === 'number' ? item.order : i + 1,
    });
  }

  // 排序
  cleanedItems.sort((a, b) => a.order - b.order);

  return await withTransaction(async (tx) => {
    const existing = await getSettingByKey('site_navigation', tx);
    const updated = await updateSettingValue({
      key: 'site_navigation',
      value: cleanedItems,
      updatedBy: actor.email,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'branding.update_navigation',
      targetType: 'system_setting',
      targetId: 'site_navigation',
      riskLevel: 'medium',
      before: existing ? existing.value : null,
      after: cleanedItems,
      requestId,
      transaction: tx,
    });

    return { data: updated.value };
  });
}

/**
 * 一键恢复官方预设配置
 */
export async function resetBrandingToDefault({ actor, requestId }) {
  if (!actor?.email) {
    return { error: '未提供有效操作员身份' };
  }

  return await withTransaction(async (tx) => {
    const brandBefore = await getSettingByKey('site_brand', tx);
    const navBefore = await getSettingByKey('site_navigation', tx);

    await updateSettingValue({
      key: 'site_brand',
      value: DEFAULT_BRAND_CONFIG,
      updatedBy: actor.email,
      transaction: tx,
    });

    await updateSettingValue({
      key: 'site_navigation',
      value: DEFAULT_NAV_CONFIG,
      updatedBy: actor.email,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'branding.reset_to_default',
      targetType: 'system_setting',
      targetId: 'site_branding_reset',
      riskLevel: 'high',
      before: { brand: brandBefore?.value, nav: navBefore?.value },
      after: { brand: DEFAULT_BRAND_CONFIG, nav: DEFAULT_NAV_CONFIG },
      requestId,
      transaction: tx,
    });

    return {
      brand: DEFAULT_BRAND_CONFIG,
      navigation: DEFAULT_NAV_CONFIG,
    };
  });
}
