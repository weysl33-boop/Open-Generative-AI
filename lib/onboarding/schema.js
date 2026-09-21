/**
 * 入驻画像的唯一契约：枚举、运营标签、人群短码与校验都从这里出。
 *
 * 每个维度都必须是受控枚举，因为它要作为「自述 vs 行为」偏差分析的基线：
 * 只有取值可枚举，后续才能把用户实际登录/生成频次和他自选的 commitment
 * 档位对齐，或用 style_codes 衡量用户是否跳出舒适风格。
 */

export const ONBOARDING_SCHEMA_VERSION = 2;
export const ONBOARDING_STEP_IDENTITY = 1;
export const ONBOARDING_STEP_PREFERENCE = 2;

/** 昵称：与 display_name 列的 50 字符上限留足余量 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;

/** icon 存 lucide 图标名：emoji 会绕过设计令牌并被读进按钮的可访问名称 */
export const OCCUPATIONS = [
  { code: 'pro', tagId: 'tag_occ_pro', persona: 'PRO', icon: 'Clapperboard', label: '影视 / 广告从业者', labelEn: 'Film & ad professional', desc: '商业短片、TVC、MV 等交付型项目', descEn: 'Client work, TVC, music video' },
  { code: 'designer', tagId: 'tag_occ_semi', persona: 'SEMI', icon: 'PenTool', label: '设计师 / 插画师', labelEn: 'Designer / illustrator', desc: '视觉、角色、平面与概念设定', descEn: 'Visual, character & concept art' },
  { code: 'content_ops', tagId: 'tag_occ_ops', persona: 'OPS', icon: 'Smartphone', label: '自媒体 / 电商运营', labelEn: 'Creator & e-commerce ops', desc: '账号内容矩阵、商品主图与详情', descEn: 'Social channels & product visuals' },
  { code: 'game_art', tagId: 'tag_occ_game', persona: 'GAME', icon: 'Gamepad2', label: '游戏 / 动漫美术', labelEn: 'Game & anime artist', desc: '角色、场景、道具资产量产', descEn: 'In-game asset production' },
  { code: 'student', tagId: 'tag_occ_student', persona: 'FAN', icon: 'Sprout', label: '学生 / 爱好者', labelEn: 'Student / hobbyist', desc: '学习阶段，或以兴趣创作为主', descEn: 'Learning or passion driven' },
];

/** 目的按用户排序提交，purposeCodes[0] 即 primary，也是人群短码第二段 */
export const PURPOSES = [
  { code: 'commercial', tagId: 'tag_pur_commercial', persona: 'COM', icon: 'Briefcase', label: '商业交付与变现', labelEn: 'Commercial delivery', desc: '接单、交付客户、直接产生收入', descEn: 'Paid work and deliveries' },
  { code: 'growth', tagId: 'tag_pur_growth', persona: 'GRW', icon: 'TrendingUp', label: '涨粉与内容增长', labelEn: 'Audience growth', desc: '运营账号、追求播放与互动', descEn: 'Channels, views and reach' },
  { code: 'learning', tagId: 'tag_pur_learning', persona: 'LRN', icon: 'BookOpen', label: '学习与技能提升', labelEn: 'Skill building', desc: '掌握工作流与新的创作手法', descEn: 'Mastering new workflows' },
  { code: 'fun', tagId: 'tag_pur_fun', persona: 'FUN', icon: 'Smile', label: '个人兴趣与自娱', labelEn: 'Personal enjoyment', desc: '不为产出，玩自己想玩的', descEn: 'Making things for fun' },
  { code: 'prototype', tagId: 'tag_pur_prototype', persona: 'PRT', icon: 'FlaskConical', label: '提案与快速原型', labelEn: 'Pitch & prototyping', desc: '方案可视化、分镜与情绪板', descEn: 'Pitches, storyboards, moodboards' },
  { code: 'community', tagId: 'tag_pur_community', persona: 'CMS', icon: 'Users', label: '社区分享与协作', labelEn: 'Community & collab', desc: '发布作品、参与共创与活动', descEn: 'Publishing and co-creating' },
];

/** 自述投入频次 —— 活跃度偏差分的锚点 */
export const COMMITMENTS = [
  { code: 'daily', tagId: 'tag_cmt_daily', persona: 'D', label: '几乎每天', labelEn: 'Nearly every day', desc: '每天或每个工作日都会创作', descEn: 'Every working day' },
  { code: 'weekly_high', tagId: 'tag_cmt_weekly_high', persona: 'W', label: '每周 3–4 次', labelEn: '3–4 times a week', desc: '有稳定的节奏和明确的项目', descEn: 'A steady weekly rhythm' },
  { code: 'weekly_low', tagId: 'tag_cmt_weekly_low', persona: 'Q', label: '每周 1–2 次', labelEn: '1–2 times a week', desc: '有空时集中做一阵', descEn: 'When time allows' },
  { code: 'monthly', tagId: 'tag_cmt_monthly', persona: 'M', label: '每月几次', labelEn: 'A few times a month', desc: '按需使用，不固定', descEn: 'On demand' },
  { code: 'browsing', tagId: 'tag_cmt_browsing', persona: 'B', label: '先看看再说', labelEn: 'Just exploring', desc: '还在评估能不能帮到我', descEn: 'Still evaluating' },
];

export const STYLES = [
  { code: 'realistic', tagId: 'tag_sty_realistic', persona: 'REAL', icon: 'Camera', label: '写实人像', labelEn: 'Photoreal' },
  { code: 'anime', tagId: 'tag_sty_anime', persona: 'ANIME', icon: 'WandSparkles', label: '二次元', labelEn: 'Anime' },
  { code: 'cg', tagId: 'tag_sty_3d', persona: 'CG', icon: 'Box', label: '3D / CG', labelEn: '3D & CG' },
  { code: 'guofeng', tagId: 'tag_sty_guofeng', persona: 'CN', icon: 'Feather', label: '国风水墨', labelEn: 'Chinese ink' },
  { code: 'scifi', tagId: 'tag_sty_scifi', persona: 'CYBER', icon: 'Rocket', label: '科幻赛博', labelEn: 'Sci-fi & cyber' },
  { code: 'product', tagId: 'tag_sty_product', persona: 'PROD', icon: 'Package', label: '产品静物', labelEn: 'Product still life' },
  { code: 'scene', tagId: 'tag_sty_scene', persona: 'SCENE', icon: 'Mountain', label: '场景概念', labelEn: 'Environment concept' },
  { code: 'cozy', tagId: 'tag_sty_cozy', persona: 'COZY', icon: 'Coffee', label: '治愈插画', labelEn: 'Cozy illustration' },
];

export const USAGE_INTENTS = [
  { code: 'personal', tagId: 'tag_use_personal', label: '仅个人自用', labelEn: 'Personal use only', desc: '不对外发布，也不商用', descEn: 'Not published or sold' },
  { code: 'internal_work', tagId: 'tag_use_internal_work', label: '团队内部使用', labelEn: 'Internal team use', desc: '用于公司或团队内部交付', descEn: 'Within my organisation' },
  { code: 'commercial', tagId: 'tag_use_commercial', label: '对外商用发布', labelEn: 'Public commercial use', desc: '会公开发布或投放', descEn: 'Published and monetised' },
  { code: 'public_release', tagId: 'tag_use_commercial', label: '公开发布但不商用', labelEn: 'Public, non-commercial', desc: '社区展示、参赛、分享', descEn: 'Showcase and contests' },
];

/** 性别只在个人主页补全，引导页不采集；枚举与文案同源，避免两处漂移 */
export const GENDER_OPTIONS = [
  { code: 'female', label: '女性', labelEn: 'Female' },
  { code: 'male', label: '男性', labelEn: 'Male' },
  { code: 'non_binary', label: '非二元性别', labelEn: 'Non-binary' },
  { code: 'prefer_not_to_say', label: '暂不透露', labelEn: 'Prefer not to say' },
];

export const GENDERS = GENDER_OPTIONS.map((option) => option.code);

/**
 * 国家候选只存 ISO-3166 alpha-2 码，名称交给 Intl.DisplayNames 按当前语言渲染，
 * 这样 40 个国家名不必进 6 份文案目录。
 */
export const COUNTRY_CODES = [
  'CN', 'HK', 'TW', 'JP', 'KR', 'SG', 'MY', 'TH', 'VN', 'ID', 'PH', 'IN', 'AE', 'SA',
  'US', 'CA', 'MX', 'BR', 'GB', 'IE', 'FR', 'DE', 'ES', 'PT', 'IT', 'NL', 'BE', 'SE',
  'NO', 'DK', 'FI', 'PL', 'CH', 'AT', 'UA', 'RU', 'TR', 'ZA', 'EG', 'NG', 'KE', 'AU', 'NZ',
];

/** 默认头像库：按 user_number 哈希确定性预选，避免所有人开局同一张脸 */
export const DEFAULT_AVATAR_COUNT = 8;
export const DEFAULT_AVATAR_BASE = '/assets/avatars';

export function defaultAvatarAt(index) {
  const normalized = ((Math.trunc(index) % DEFAULT_AVATAR_COUNT) + DEFAULT_AVATAR_COUNT) % DEFAULT_AVATAR_COUNT;
  return `${DEFAULT_AVATAR_BASE}/default-${String(normalized + 1).padStart(2, '0')}.svg`;
}

export function defaultAvatarUrl(seed) {
  const digits = String(seed ?? '').replace(/\D/g, '');
  const sum = [...digits].reduce((acc, ch) => acc + Number(ch), 0);
  return defaultAvatarAt(digits ? sum : 0);
}

const byCode = (list) => Object.fromEntries(list.map((item) => [item.code, item]));
export const OCCUPATION_MAP = byCode(OCCUPATIONS);
export const PURPOSE_MAP = byCode(PURPOSES);
export const COMMITMENT_MAP = byCode(COMMITMENTS);
export const STYLE_MAP = byCode(STYLES);
export const USAGE_INTENT_MAP = byCode(USAGE_INTENTS);

export const PURPOSE_MAX = 3;
export const PURPOSE_MIN = 1;
export const STYLE_MAX = 4;
export const STYLE_MIN = 2;

/**
 * 人群短码 = 职业档-主目的-强度档-主风格，例 `PRO-COM-D-REAL`。
 * 运营侧可直接 group by 或按前缀圈层，也是配对行为数据的检索键。
 */
export function buildPersonaCode({ occupation, purposeCodes, commitment, styleCodes }) {
  const segments = [
    OCCUPATION_MAP[occupation]?.persona,
    PURPOSE_MAP[purposeCodes?.[0]]?.persona,
    COMMITMENT_MAP[commitment]?.persona,
    STYLE_MAP[styleCodes?.[0]]?.persona,
  ];
  return segments.every(Boolean) ? segments.join('-') : null;
}

function cleanCodes(value, allowed, max) {
  if (!Array.isArray(value)) return null;
  const seen = [];
  for (const raw of value) {
    const code = typeof raw === 'string' ? raw : '';
    if (!allowed[code] || seen.includes(code)) continue;
    seen.push(code);
    if (seen.length >= max) break;
  }
  return seen;
}

/**
 * 归一化第二步答案。返回 { error } 而不是抛异常，让路由层能原样回给用户。
 */
export function normalizePreferenceAnswers(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const occupation = typeof source.occupation === 'string' ? source.occupation : '';
  if (!OCCUPATION_MAP[occupation]) return { error: '请选择你的职业身份' };

  const commitment = typeof source.commitment === 'string' ? source.commitment : '';
  if (!COMMITMENT_MAP[commitment]) return { error: '请选择你的创作频率' };

  const usageIntent = typeof source.usageIntent === 'string' ? source.usageIntent : '';
  if (!USAGE_INTENT_MAP[usageIntent]) return { error: '请选择作品用途' };

  const purposeCodes = cleanCodes(source.purposeCodes, PURPOSE_MAP, PURPOSE_MAX);
  if (!purposeCodes || purposeCodes.length < PURPOSE_MIN) return { error: '至少选择 1 个创作目的' };

  const styleCodes = cleanCodes(source.styleCodes, STYLE_MAP, STYLE_MAX);
  if (!styleCodes || styleCodes.length < STYLE_MIN) return { error: '至少选择 2 个风格取向' };

  return {
    value: {
      occupation,
      occupationLabel: OCCUPATION_MAP[occupation].label,
      purposeCodes,
      commitment,
      styleCodes,
      usageIntent,
      allowTraining: source.allowTraining === true,
    },
  };
}

/** 提交时同步落到 ops_bill.tags 的运营标签 */
export function tagIdsForPreferences({ occupation, purposeCodes, commitment, styleCodes, usageIntent, allowTraining }) {
  const ids = new Set();
  const add = (tagId) => { if (tagId) ids.add(tagId); };
  add(OCCUPATION_MAP[occupation]?.tagId);
  add(COMMITMENT_MAP[commitment]?.tagId);
  add(USAGE_INTENT_MAP[usageIntent]?.tagId);
  if (allowTraining) add('tag_use_training');
  for (const code of purposeCodes || []) add(PURPOSE_MAP[code]?.tagId);
  for (const code of styleCodes || []) add(STYLE_MAP[code]?.tagId);
  return [...ids];
}

export function normalizeNickname(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length < NICKNAME_MIN) return { error: `昵称至少 ${NICKNAME_MIN} 个字符` };
  if (text.length > NICKNAME_MAX) return { error: `昵称最多 ${NICKNAME_MAX} 个字符` };
  return { value: text };
}
