import { execute, queryMany, queryOne, nowIso } from '../db/index.js';

const BANNER_HISTORY_COLUMNS = `
  id, title, message, highlight_text AS "highlightText", cta_text AS "ctaText",
  link_url AS "linkUrl", link_target AS "linkTarget", theme,
  ambient_glow AS "ambientGlow", glow_style AS "glowStyle", dynamic_effect AS "dynamicEffect",
  badge_text AS "badgeText", show_pulse_dot AS "showPulseDot", dismissible,
  auto_hide_days AS "autoHideDays", target_scope AS "targetScope", is_active AS "isActive",
  created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function listBannerHistory() {
  return queryMany(`SELECT ${BANNER_HISTORY_COLUMNS} FROM ops_bill.banner_history ORDER BY created_at DESC LIMIT 50`);
}

export async function archiveBannerConfig(config, actorEmail) {
  await execute('UPDATE ops_bill.banner_history SET is_active = false');
  return execute(`
    INSERT INTO ops_bill.banner_history (
      id, title, message, highlight_text, cta_text, link_url, link_target, theme,
      ambient_glow, glow_style, dynamic_effect, badge_text, show_pulse_dot,
      dismissible, auto_hide_days, target_scope, is_active, created_by, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, message = EXCLUDED.message,
      highlight_text = EXCLUDED.highlight_text, cta_text = EXCLUDED.cta_text,
      link_url = EXCLUDED.link_url, link_target = EXCLUDED.link_target, theme = EXCLUDED.theme,
      ambient_glow = EXCLUDED.ambient_glow, glow_style = EXCLUDED.glow_style,
      dynamic_effect = EXCLUDED.dynamic_effect, badge_text = EXCLUDED.badge_text,
      show_pulse_dot = EXCLUDED.show_pulse_dot, dismissible = EXCLUDED.dismissible,
      auto_hide_days = EXCLUDED.auto_hide_days, target_scope = EXCLUDED.target_scope,
      is_active = true, updated_at = now()
  `, [
    config.id, config.title, config.message, config.highlightText, config.ctaText,
    config.linkUrl, config.linkTarget, config.theme, config.ambientGlow, config.glowStyle,
    config.dynamicEffect, config.badgeText, config.showPulseDot, config.dismissible,
    config.autoHideDays, config.targetScope, actorEmail || 'admin',
  ]);
}

export async function findBannerHistory(id) {
  return queryOne(`
    SELECT id, title, message, highlight_text AS "highlightText", cta_text AS "ctaText",
      link_url AS "linkUrl", link_target AS "linkTarget", theme,
      ambient_glow AS "ambientGlow", glow_style AS "glowStyle", dynamic_effect AS "dynamicEffect",
      badge_text AS "badgeText", show_pulse_dot AS "showPulseDot", dismissible,
      auto_hide_days AS "autoHideDays", target_scope AS "targetScope"
    FROM ops_bill.banner_history WHERE id = $1
  `, [id]);
}

export async function findBannerHistoryState(id) {
  return queryOne('SELECT id, is_active AS "isActive" FROM ops_bill.banner_history WHERE id = $1', [id]);
}

export async function deleteBannerHistory(id) {
  return execute('DELETE FROM ops_bill.banner_history WHERE id = $1', [id]);
}

export async function insertBannerEvent({ bannerId, eventType, userId, anonymousId, targetUrl, pagePath, locale, userAgent, ip }) {
  return execute(`
    INSERT INTO ops_bill.banner_events (
      banner_id, event_type, user_id, anonymous_id,
      target_url, page_path, locale, user_agent, ip, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [bannerId, eventType, userId, anonymousId, targetUrl, pagePath, locale, userAgent, ip, nowIso()]);
}

export async function getBannerAnalyticsRows({ bannerId = null, limit, offset }) {
  const [summaryRow, countRow, rows] = await Promise.all([
    queryOne(`
      SELECT COUNT(*) FILTER (WHERE event_type = 'impression') AS total_impressions,
        COUNT(*) FILTER (WHERE event_type = 'click') AS total_clicks,
        COUNT(*) FILTER (WHERE event_type = 'dismiss') AS total_dismissals,
        COUNT(DISTINCT anonymous_id) AS unique_visitors
      FROM ops_bill.banner_events WHERE ($1::text IS NULL OR banner_id = $1::text)
    `, [bannerId]),
    queryOne(`SELECT COUNT(*) AS total_count FROM ops_bill.banner_events WHERE ($1::text IS NULL OR banner_id = $1::text)`, [bannerId]),
    queryMany(`
      SELECT id, banner_id, event_type, user_id, anonymous_id,
        target_url, page_path, locale, user_agent, ip, created_at
      FROM ops_bill.banner_events
      WHERE ($1::text IS NULL OR banner_id = $1::text)
      ORDER BY created_at DESC LIMIT $2 OFFSET $3
    `, [bannerId, limit, offset]),
  ]);
  return { summaryRow, countRow, rows };
}

export async function resetBannerEvents() {
  return execute('TRUNCATE TABLE ops_bill.banner_events');
}
