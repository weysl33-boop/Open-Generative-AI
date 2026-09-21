import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 引导画像的分步契约：schema 是唯一事实源，迁移 026、API、页面守卫都必须与它对齐。
// 这些断言刻意不碰数据库 —— 线上 users 表就在隧道另一端，一次误写就是生产事故。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const {
  COUNTRY_CODES,
  COMMITMENTS,
  DEFAULT_AVATAR_COUNT,
  GENDERS,
  GENDER_OPTIONS,
  NICKNAME_MAX,
  NICKNAME_MIN,
  OCCUPATIONS,
  ONBOARDING_SCHEMA_VERSION,
  PURPOSES,
  STYLE_MAX,
  STYLE_MIN,
  STYLES,
  USAGE_INTENTS,
  buildPersonaCode,
  defaultAvatarAt,
  defaultAvatarUrl,
  normalizeNickname,
  normalizePreferenceAnswers,
  tagIdsForPreferences,
} = await import('../../lib/onboarding/schema.js');

const ALL_ANSWERS = {
  occupation: 'pro',
  purposeCodes: ['commercial', 'growth'],
  commitment: 'daily',
  styleCodes: ['realistic', 'anime'],
  usageIntent: 'commercial',
  allowTraining: false,
};

const MIGRATION = 'lib/db/migrations/026_user_profile_onboarding_v2.sql';

const {
  DESC_FIELDS,
  LABEL_FIELDS,
  optionDesc,
  optionLabel,
  randomNickname,
} = await import('../../lib/onboarding/copy.js');

const OPTION_LISTS = { OCCUPATIONS, PURPOSES, COMMITMENTS, STYLES, USAGE_INTENTS };

// 注册表是语言码的唯一来源；locales.js 直链 JSON 消息包，纯 node 下 import 不进来，只能按文本抠。
const registryCodes = () => [...source('lib/locales.js').matchAll(/^ {4}code: '([^']+)',$/gm)].map((m) => m[1]);

test('P0 every persona tag exists in migration 026 and no two options share one', () => {
  const sql = source(MIGRATION);
  const declared = new Set([...sql.matchAll(/\('(tag_[a-z0-9_]+)'/g)].map((match) => match[1]));
  // 允许选项不带标签（它就是不进运营口径），但不许两个选项挤进同一条。
  const referenced = Object.values(OPTION_LISTS).flat().map((entry) => entry.tagId).filter(Boolean);

  for (const tagId of referenced) {
    assert.equal(declared.has(tagId), true, `${tagId} is used by the schema but never inserted`);
  }
  assert.equal(new Set(referenced).size, referenced.length, 'two mutually exclusive answers share one ops tag');
  assert.equal(declared.has('tag_use_training'), true);
});

test('P0 the database CHECK constraints list the same enums the schema offers', () => {
  const sql = source(MIGRATION);
  const inList = (constraint) => {
    const block = new RegExp(`${constraint}\\s+CHECK \\([^)]*\\)`, 'i').exec(sql)?.[0] || '';
    return new Set([...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]));
  };
  assert.deepEqual(inList('users_gender_check'), new Set(GENDERS));
  assert.deepEqual(inList('users_commitment_check'), new Set(COMMITMENTS.map((entry) => entry.code)));
  assert.deepEqual(inList('users_usage_intent_check'), new Set(USAGE_INTENTS.map((entry) => entry.code)));
});

test('P0 the persona code is a four-segment key and needs every dimension', () => {
  assert.equal(
    buildPersonaCode({
      occupation: 'pro',
      purposeCodes: ['commercial', 'fun'],
      commitment: 'daily',
      styleCodes: ['realistic', 'anime'],
    }),
    'PRO-COM-D-REAL',
  );
  // 排序即优先级：第二段取 purposes[0]，第四段取 styles[0]。
  assert.equal(
    buildPersonaCode({
      occupation: 'pro',
      purposeCodes: ['fun', 'commercial'],
      commitment: 'daily',
      styleCodes: ['anime', 'realistic'],
    }),
    'PRO-FUN-D-ANIME',
  );
  assert.equal(buildPersonaCode({ occupation: 'pro', purposeCodes: [], commitment: 'daily', styleCodes: ['anime'] }), null);
  assert.equal(buildPersonaCode({ occupation: 'nope', purposeCodes: ['fun'], commitment: 'daily', styleCodes: ['anime'] }), null);
});

test('P0 preference answers are validated against the enum, not trusted from the client', () => {
  assert.equal(normalizePreferenceAnswers(ALL_ANSWERS).value.occupationLabel, OCCUPATIONS[0].label);
  assert.equal(normalizePreferenceAnswers({}).error, '请选择你的职业身份');
  assert.equal(normalizePreferenceAnswers({ ...ALL_ANSWERS, occupation: 'hacker' }).error, '请选择你的职业身份');
  assert.equal(normalizePreferenceAnswers({ ...ALL_ANSWERS, commitment: '' }).error, '请选择你的创作频率');
  assert.equal(normalizePreferenceAnswers({ ...ALL_ANSWERS, usageIntent: 'whatever' }).error, '请选择作品用途');
  assert.equal(normalizePreferenceAnswers({ ...ALL_ANSWERS, purposeCodes: [] }).error, '至少选择 1 个创作目的');
  assert.equal(normalizePreferenceAnswers({ ...ALL_ANSWERS, styleCodes: ['anime'] }).error, '至少选择 2 个风格取向');

  const dirty = normalizePreferenceAnswers({
    ...ALL_ANSWERS,
    purposeCodes: ['commercial', 'commercial', 'not-a-code', 'growth', 'fun', 'learning'],
    styleCodes: ['anime', 'anime', 'bogus', 'cg', 'scifi', 'product', 'scene'],
  });
  // 未知码丢弃、重复折叠、超出上限截断：运营统计的取值域因此始终等于 schema。
  assert.deepEqual(dirty.value.purposeCodes, ['commercial', 'growth', 'fun']);
  assert.deepEqual(dirty.value.styleCodes, ['anime', 'cg', 'scifi', 'product']);
  assert.equal(dirty.value.allowTraining, false);
});

test('P0 submitting preferences yields one tag per dimension without duplicates', () => {
  const tags = tagIdsForPreferences(normalizePreferenceAnswers(ALL_ANSWERS).value);
  assert.deepEqual(tags, ['tag_occ_pro', 'tag_cmt_daily', 'tag_use_commercial', 'tag_pur_commercial', 'tag_pur_growth', 'tag_sty_realistic', 'tag_sty_anime']);
  assert.equal(new Set(tags).size, tags.length);
  assert.equal(
    tagIdsForPreferences({ ...ALL_ANSWERS, allowTraining: true }).includes('tag_use_training'),
    true,
  );
});

test('P0 nickname rules match the input the page renders', () => {
  assert.equal(NICKNAME_MIN, 2);
  assert.equal(NICKNAME_MAX, 24);
  assert.deepEqual(normalizeNickname('  夜色   放映员  '), { value: '夜色 放映员' });
  assert.equal(normalizeNickname('  ').error, `昵称至少 ${NICKNAME_MIN} 个字符`);
  assert.equal(normalizeNickname('a'.repeat(NICKNAME_MAX + 1)).error, `昵称最多 ${NICKNAME_MAX} 个字符`);
  assert.equal(normalizeNickname(null).error, `昵称至少 ${NICKNAME_MIN} 个字符`);
});

test('P0 the default avatar wall is finite, deterministic and complete on disk', () => {
  for (let index = 0; index < DEFAULT_AVATAR_COUNT; index += 1) {
    const url = defaultAvatarAt(index);
    assert.equal(fs.existsSync(path.join(repoRoot, 'public', url.replace(/^\//, ''))), true, `${url} is missing`);
  }
  assert.equal(defaultAvatarAt(DEFAULT_AVATAR_COUNT), defaultAvatarAt(0));
  assert.equal(defaultAvatarAt(-1), defaultAvatarAt(DEFAULT_AVATAR_COUNT - 1));
  assert.equal(defaultAvatarUrl('650410'), defaultAvatarUrl('65-04-10'));
  assert.equal(defaultAvatarUrl(''), defaultAvatarUrl(null));
  assert.equal(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)), true);
  assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length);
  assert.deepEqual(GENDERS, GENDER_OPTIONS.map((option) => option.code));
});

test('P0 the studio entry points are guarded and finished users cannot re-enter onboarding', () => {
  const entryPoints = {
    '/studio': 'app/studio/[[...slug]]/page.js',
    '/[locale]/studio': 'app/[locale]/studio/[[...slug]]/page.js',
    '/zh/studio': 'app/zh/studio/[[...slug]]/page.js',
  };
  for (const [name, file] of Object.entries(entryPoints)) {
    const text = source(file);
    assert.equal(text.includes('await assertOnboardingComplete()'), true, `${name} must run the onboarding guard`);
    assert.ok(text.indexOf('await assertOnboardingComplete()') < text.indexOf('<StandaloneShell'), `${name} must guard before rendering the shell`);
  }

  const onboardingPage = source('app/onboarding/page.js');
  assert.match(onboardingPage, /if \(user\.onboardingCompleted\) redirect\(studioHref\)/);
  assert.match(source('lib/onboarding/guard.js'), /redirect\('\/onboarding'\)/);
});

test('P0 country and gender stay empty until chosen and can never be cleared again', () => {
  const repository = source('lib/repositories/users.js');
  assert.match(repository, /addIfPresent\('country', fields\.country\)/);
  assert.match(repository, /addIfPresent\('gender', fields\.gender\)/);
  assert.equal(/add\('country', null\)/.test(repository), false);

  const route = source('app/api/user/profile/route.js');
  assert.match(route, /COUNTRY_CODES\.includes\(country\)/);
  assert.match(route, /GENDERS\.includes\(gender\)/);
});

test('P0 the auth and login exits hand new users to onboarding', () => {
  const callback = source('app/api/auth/oauth/[provider]/callback/route.js');
  assert.match(callback, /await requiresOnboarding\(user\.id\)/);
  for (const file of ['app/api/auth/login/route.js', 'app/api/auth/register/route.js', 'app/api/auth/phone/verify/route.js']) {
    assert.match(source(file), /requiresOnboarding: await requiresOnboarding\(/, `${file} must report the flag`);
  }
  assert.match(source('components/AuthModal.js'), /window\.location\.href = '\/onboarding'/);
});

test('P0 every copy key the onboarding pages read exists in all six catalogues', () => {
  const locales = { en: 'en', zh: 'zh-CN', 'ja-JP': 'ja-JP', 'ko-KR': 'ko-KR', 'zh-TW': 'zh-TW', es: 'es' };
  const used = new Set();
  for (const name of fs.readdirSync(path.join(repoRoot, 'components/onboarding'))) {
    const text = fs.readFileSync(path.join(repoRoot, 'components/onboarding', name), 'utf8');
    for (const match of text.matchAll(/\bcopy\.([A-Za-z][A-Za-z0-9]*)/g)) used.add(match[1]);
  }
  assert.ok(used.size >= 40, `expected the flow to read a full copy block, saw ${used.size}`);

  const placeholders = (value) => [...String(value).matchAll(/\{\{?\s*([\w.-]+)\s*\}?\}/g)].map((m) => m[1]).sort().join(',');
  let baseline;
  for (const [dir] of Object.entries(locales)) {
    const block = JSON.parse(source(`messages/${dir}/common.json`)).onboarding;
    assert.ok(block, `${dir} is missing the onboarding namespace`);
    for (const key of used) {
      assert.equal(typeof block[key], 'string', `${dir}: onboarding.${key} is missing`);
      assert.ok(block[key].trim(), `${dir}: onboarding.${key} is blank`);
    }
    const shape = Object.keys(block).sort().map((key) => `${key}=${placeholders(block[key])}`).join('|');
    if (!baseline) baseline = shape;
    else assert.equal(shape, baseline, `${dir}: onboarding keys or placeholders diverged from en`);
  }
});

test('P0 option copy fields cover every registered locale, and only zh-CN reads the simplified field', () => {
  const codes = registryCodes();
  assert.deepEqual(Object.keys(LABEL_FIELDS).sort(), [...codes].sort(), 'LABEL_FIELDS misses a registered locale');
  assert.deepEqual(Object.keys(DESC_FIELDS).sort(), [...codes].sort(), 'DESC_FIELDS misses a registered locale');
  assert.equal(LABEL_FIELDS['zh-CN'], 'label');
  assert.equal(DESC_FIELDS['zh-CN'], 'desc');
  for (const [code, field] of Object.entries(LABEL_FIELDS)) {
    if (code !== 'zh-CN') assert.notEqual(field, 'label', `${code} must not point at the simplified label`);
  }
  for (const [code, field] of Object.entries(DESC_FIELDS)) {
    if (code !== 'zh-CN') assert.notEqual(field, 'desc', `${code} must not point at the simplified desc`);
  }
});

test('P0 every option resolves its own text in every registered locale', () => {
  for (const [name, list] of Object.entries(OPTION_LISTS)) {
    const filled = list.filter((entry) => optionDesc(entry, 'en').trim()).length;
    assert.ok(filled === 0 || filled === list.length, `${name}: desc must cover the whole list or none of it`);
    for (const entry of list) {
      for (const [code, field] of Object.entries(LABEL_FIELDS)) {
        assert.equal(optionLabel(entry, code), entry[field], `${name}.${entry.code} does not resolve ${code}`);
        assert.ok(entry[field]?.trim(), `${name}.${entry.code} has no ${code} label`);
      }
      for (const [code, field] of Object.entries(DESC_FIELDS)) {
        assert.equal(optionDesc(entry, code), entry[field] ?? '', `${name}.${entry.code} desc does not resolve ${code}`);
      }
    }
  }
});

test('P0 a missing locale field falls back to English, never to simplified', () => {
  const bare = { code: 'x', label: '夜色', labelEn: 'Nightfall', desc: '简体说明', descEn: 'Simplified blurb' };
  for (const code of registryCodes().filter((entry) => entry !== 'zh-CN' && entry !== 'en')) {
    assert.equal(optionLabel(bare, code), 'Nightfall', `${code} leaked the simplified label`);
    assert.equal(optionDesc(bare, code), 'Simplified blurb', `${code} leaked the simplified desc`);
  }
  assert.equal(optionLabel(bare, 'zh-CN'), '夜色');
  assert.equal(optionLabel(bare, 'xx'), 'Nightfall');
});

test('P0 random nicknames fit the nickname limits in every registered locale', () => {
  for (const code of registryCodes()) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const name = randomNickname(code);
      assert.match(name, /\d{3}$/, `${code}: generated name lost its numeric suffix`);
      assert.ok(
        name.length >= NICKNAME_MIN && name.length <= NICKNAME_MAX,
        `${code}: "${name}" is outside ${NICKNAME_MIN}-${NICKNAME_MAX}`,
      );
    }
  }
});

test('P0 onboarding surfaces never branch on locale or read one language field directly', () => {
  const files = [
    ...fs.readdirSync(path.join(repoRoot, 'components/onboarding')).map((name) => `components/onboarding/${name}`),
    'app/onboarding/page.js',
  ];
  for (const file of files) {
    const text = source(file);
    assert.equal(/\bisZh\b/.test(text), false, `${file} still branches on isZh`);
    assert.equal(/startsWith\(['"]zh/.test(text), false, `${file} still sniffs a zh prefix`);
    assert.equal(/\.(labelEn|descEn|labelTw|descTw|labelJa|descJa|labelKo|descKo|labelEs|descEs)\b/.test(text), false, `${file} bypasses lib/onboarding/copy`);
  }
});

test('P0 step two offers exactly one way back', () => {
  assert.equal(/\bcopy\.back\b/.test(source('components/onboarding/OnboardingFlow.js')), false, 'the flow footer duplicated the card back button');
});

test('P0 schema and copy stay dependency-free so client components and node --test can both load them', () => {
  for (const file of ['lib/onboarding/schema.js', 'lib/onboarding/copy.js']) {
    assert.equal(/^import\s/m.test(source(file)), false, `${file} must not import anything`);
  }
});

test('P0 the onboarding api refuses an empty body instead of declaring the user onboarded', () => {
  const route = source('app/api/user/onboarding/route.js');
  assert.match(route, /const legacy = body\.preferences !== undefined/);
  // 三条分支之外必须显式 422，否则空 POST 就能把 onboarding_completed 置真。
  assert.match(route, /'请提交第二步的习惯偏好答案'/);
});

test('P0 the persona schema version is what migration 026 wrote answers for', () => {
  assert.equal(ONBOARDING_SCHEMA_VERSION, 2);
  const service = source('lib/services/auth.js');
  assert.match(service, /preference: \{ \.\.\.value, schemaVersion: ONBOARDING_SCHEMA_VERSION/);
  // 列与 JSON 双写：列用于按版本圈选存量用户，JSON 让单条回答自解释。
  assert.match(source('lib/repositories/auth.js'), /onboarding_schema_version = COALESCE\(\$\d+::smallint, onboarding_schema_version\)/);
  assert.match(source(MIGRATION), /onboarding_schema_version SMALLINT/);
});
