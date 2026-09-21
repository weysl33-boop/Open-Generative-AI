// Content Moderation & Sensitive Prompt Guard

const BLOCKED_PATTERNS = [
  /\b(child\s*porn|csam|cp|pedophil|pedo)\b/i,
  /\b(suicide|self-harm|self\s*harm)\b/i,
  /\b(bomb\s*making|terrorist|terrorism|isis|al-qaeda)\b/i,
  /\b(nazi|hitler\s*did\s*nothing\s*wrong)\b/i,
  /(幼女|童妓|幼童性|自残|自杀教程|制造炸弹|毒品合成|恐怖袭击)/i,
];

export function validatePromptSafety(prompt) {
  if (!prompt || typeof prompt !== 'string') return { passed: true };
  const text = prompt.trim();
  if (!text) return { passed: true };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        passed: false,
        reason: '提示词包含敏感或违规内容，请遵守平台使用规范并调整后重试',
        code: 'CONTENT_POLICY_VIOLATION',
      };
    }
  }

  return { passed: true };
}
