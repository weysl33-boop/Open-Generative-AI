import { headers } from 'next/headers';
import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getProvidersOverview } from '@/lib/services/providers';
import { getSettingByKey } from '@/lib/services/settings';
import { getSmsAdminOverview } from '@/lib/smsAdmin';
import { isOAuthProviderConfigured } from '@/lib/oauth';
import {
  SOCIAL_LOGIN_CATALOG,
  SOCIAL_LOGIN_REGIONS,
  SOCIAL_LOGIN_SETTING_KEY,
  sanitizeSocialLoginConfig,
} from '@/lib/auth/socialProviders';
import { getChinaIpBlockConfig, isChinaIp, resolveClientIp } from '@/lib/security/chinaIpBlock';
import LoginMethodsClient from './LoginMethodsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '登录方式与连通性 | 管理后台',
};

// 前台按 OAuth 路由段命名渠道（/api/auth/oauth/wechat），后台凭据记录用
// wechat_oauth 命名空间以免与微信支付串线，这里做一次桥接。
const CREDENTIAL_PROVIDER_ID = { wechat: 'wechat_oauth' };

const REGION_META = {
  mainland_china: {
    label: '中国大陆',
    description: '命中境内 IP 段的访客只会看到这一组扫码/快捷登录。',
  },
  international: {
    label: '海外',
    description: '其余全部 IP（含港澳台与境外节点）看到这一组 OAuth 登录。',
  },
};

export default async function LoginMethodsPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);

  const channelIds = SOCIAL_LOGIN_REGIONS.flatMap((region) => SOCIAL_LOGIN_CATALOG[region]);
  const [allProviders, smsOverview, stored, configuredFlags] = await Promise.all([
    getProvidersOverview(),
    getSmsAdminOverview(),
    getSettingByKey(SOCIAL_LOGIN_SETTING_KEY).catch(() => null),
    Promise.all(channelIds.map((id) => isOAuthProviderConfigured(id).catch(() => true))),
  ]);

  const socialProviders = allProviders.filter((provider) => provider.kind === 'social');
  const config = sanitizeSocialLoginConfig(stored?.value ?? stored);
  const configuredById = Object.fromEntries(channelIds.map((id, index) => [id, configuredFlags[index] !== false]));

  const regions = SOCIAL_LOGIN_REGIONS.map((region) => ({
    id: region,
    ...REGION_META[region],
    channels: config[region].map((entry) => ({
      id: entry.id,
      enabled: entry.enabled,
      configured: configuredById[entry.id],
      provider:
        socialProviders.find((provider) => provider.id === (CREDENTIAL_PROVIDER_ID[entry.id] || entry.id)) || null,
    })),
  }));

  const headerList = await headers();
  const { ip, source } = resolveClientIp(headerList);
  const isMainland = isChinaIp(ip, headerList);
  const diagnostics = {
    clientIp: ip,
    ipSource: source,
    region: isMainland ? 'mainland_china' : 'international',
    gateEnabled: getChinaIpBlockConfig().enabled,
  };

  return (
    <>
      <PageHeader
        eyebrow="登录配置"
        title="登录方式与连通性"
        description="社交与短信两类登录的凭据、开关与连通性探针集中在此管理。社交渠道按访客 IP 分境内与境外两套独立展示；邮箱 SMTP 发信在「邮件发信设置」单独维护。"
      />
      <LoginMethodsClient
        regions={regions}
        diagnostics={diagnostics}
        smsInitial={smsOverview}
        canWrite={hasPermission(user.role, PERMISSIONS.providersWrite)}
      />
    </>
  );
}
