import { saveBannerConfig } from '../lib/services/content.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

async function main() {
  await assertSandboxDatabase();
  const res = await saveBannerConfig({
    actor: { email: 'system_flova@koyosim.com', role: 'super_admin' },
    config: {
      id: 'banner-flova-promo',
      title: '上新特惠：年会员全线大促',
      enabled: true,
      highlightText: '上新特惠：',
      message: '年会员享 Flova Image 2.5、Seedance 2.5 最低4折，1K 低至 ¥0.058/张，Seedance 2.5 480p 低至 ¥0.175/秒',
      ctaText: '立即订阅',
      linkUrl: '/pricing',
      linkTarget: '_self',
      theme: 'indigo',
      ambientGlow: true,
      glowStyle: 'aurora',
      dynamicEffect: 'breathe',
      badgeText: 'HOT',
      showPulseDot: true,
      dismissible: true,
      autoHideDays: 7,
      targetScope: 'all'
    },
    requestId: 'init-flova-' + Date.now()
  });
  console.log('INIT_RESULT:', JSON.stringify(res));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
