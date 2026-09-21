// Single source of truth for the `/studio/*` route segments.
// The server catch-all pages and the client shell both resolve against this list so a
// mistyped link 404s instead of silently rendering Image Studio (A-08).
export const STUDIO_TAB_IDS = Object.freeze([
  'image',
  'headshot',
  'layers',
  'ai-influencer',
  'cinema',
  'video',
  'clipping',
  'motion-control',
  'vibe-motion',
  'lipsync',
  'body-swap',
  'marketing',
  'audio',
  'agents',
  'workflows',
  'design-agent',
  'apps',
]);

// Kept because the shell also resolves the singular alias: /studio/workflow/<id>
export const STUDIO_ALIAS_SEGMENTS = Object.freeze(['workflow']);

export function isStudioSlug(slug) {
  if (!Array.isArray(slug) || slug.length === 0) return true;
  const [first] = slug;
  if (typeof first !== 'string') return false;
  return STUDIO_TAB_IDS.includes(first) || STUDIO_ALIAS_SEGMENTS.includes(first);
}
