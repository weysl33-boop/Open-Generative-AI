import { NextResponse } from 'next/server';
import { getBannerConfig, getMotionConfig } from '@/lib/services/content';
import { getSettingByKey } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [banner, motion, exploreAppsSetting] = await Promise.all([
      getBannerConfig(),
      getMotionConfig(),
      getSettingByKey('feature_explore_apps').catch(() => null),
    ]);

    const exploreAppsEnabled = Boolean(
      exploreAppsSetting?.value?.enabled === true ||
      exploreAppsSetting?.value === true
    );

    return NextResponse.json(
      {
        banner,
        motion,
        features: {
          explore_apps_enabled: exploreAppsEnabled,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[api/site/content-config] error:', err);
    return NextResponse.json(
      { error: 'Failed to load content config' },
      { status: 500 }
    );
  }
}
