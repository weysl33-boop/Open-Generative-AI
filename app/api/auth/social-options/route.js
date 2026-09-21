import { NextResponse } from 'next/server';
import { getSettingByKey } from '@/lib/services/settings';
import { isOAuthProviderConfigured } from '@/lib/oauth';
import { getSocialLoginRegion } from '@/lib/auth/socialRegion';
import {
  SOCIAL_LOGIN_CATALOG,
  SOCIAL_LOGIN_REGIONS,
  SOCIAL_LOGIN_SETTING_KEY,
  getSocialLoginProviders,
} from '@/lib/auth/socialProviders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const region = getSocialLoginRegion(request.headers);

  const [stored, ...configuredFlags] = await Promise.all([
    getSettingByKey(SOCIAL_LOGIN_SETTING_KEY).catch(() => null),
    ...SOCIAL_LOGIN_REGIONS.flatMap((name) =>
      SOCIAL_LOGIN_CATALOG[name].map((id) => isOAuthProviderConfigured(id).catch(() => true))
    ),
  ]);

  const configured = {};
  SOCIAL_LOGIN_REGIONS.flatMap((name) => SOCIAL_LOGIN_CATALOG[name]).forEach((id, index) => {
    configured[id] = configuredFlags[index] !== false;
  });

  const providers = getSocialLoginProviders(region, {
    config: stored?.value ?? stored,
    configured,
  });

  return NextResponse.json(
    { region, providers },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'x-real-ip, cf-connecting-ip, x-forwarded-for',
      },
    }
  );
}
