import pg from 'pg';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

const { Client } = pg;

async function main() {
  await assertSandboxDatabase();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const config = {
    id: "banner-flova-promo",
    title: "上新特惠：年会员全线大促 (Flova 风格)",
    enabled: true,
    highlightText: "上新特惠：",
    message: "年会员享 Flova Image 2.5、Seedance 2.5 最低4折，1K 低至 ¥0.058/张，Seedance 2.5 480p 低至 ¥0.175/秒",
    ctaText: "立即订阅",
    linkUrl: "/pricing",
    linkTarget: "_self",
    theme: "indigo",
    ambientGlow: true,
    glowStyle: "aurora",
    dynamicEffect: "breathe",
    badgeText: "HOT",
    showPulseDot: true,
    dismissible: true,
    autoHideDays: 7,
    targetScope: "all"
  };

  await client.query(
    "UPDATE ops_bill.system_settings SET value_json = $1::jsonb, updated_at = now() WHERE key = 'site_banner'",
    [JSON.stringify(config)]
  );

  await client.query("UPDATE ops_bill.banner_history SET is_active = false");
  await client.query(
    "INSERT INTO ops_bill.banner_history (id, title, message, highlight_text, cta_text, link_url, link_target, theme, ambient_glow, glow_style, dynamic_effect, badge_text, show_pulse_dot, dismissible, auto_hide_days, target_scope, is_active, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, 'system', now(), now()) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, highlight_text = EXCLUDED.highlight_text, cta_text = EXCLUDED.cta_text, is_active = true, updated_at = now()",
    [
      config.id, config.title, config.message, config.highlightText, config.ctaText,
      config.linkUrl, config.linkTarget, config.theme, config.ambientGlow,
      config.glowStyle, config.dynamicEffect, config.badgeText, config.showPulseDot,
      config.dismissible, config.autoHideDays, config.targetScope
    ]
  );

  console.log("SUCCESS: Flova Banner & History active in PostgreSQL");
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
