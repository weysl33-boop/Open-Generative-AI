-- 1. 清理 free 体验版
UPDATE plans_config
SET name = '免费体验版',
    features_json = '{"items": ["基础图片与视频工作流", "每日签到赠送算力", "全站免Key云端托管推理"], "meta": {"yearlyCny": 0, "yearlyUsd": 0, "quotaBase": 0, "quotaBonus": 0, "concurrency": 2, "asyncConcurrency": 3, "portraitCapacity": 0, "badge": "免费体验"}}'::jsonb,
    display_order = 0,
    sort_order = 0,
    enabled = 1,
    is_active = 1,
    updated_at = now()
WHERE id = 'free';

-- 2. 彻底清理并更新 Pro 套餐（彻底去除 BYOK）
UPDATE plans_config
SET name = 'Pro (旗舰大师版)',
    monthly_cny = 1400.00,
    price_cny = 1400.00,
    monthly_usd = 200.00,
    price_usd = 200.00,
    credits_included = 20000,
    features_json = '{"items": ["每月 20,000 + 10,000 额度 (多送50%)", "专享 Seedance 2.5 & 2.0 异步并发: 80", "单模型并发数: 15", "授权人像容量: 20 个", "图片视频 4K 极清超采样", "多语言真人双风格极速生成", "VIP 1对1 专属技术支持与企业级 SLA"], "meta": {"yearlyCny": 13999, "yearlyUsd": 1999, "quotaBase": 20000, "quotaBonus": 10000, "concurrency": 15, "asyncConcurrency": 80, "portraitCapacity": 20, "badge": "多送50% · 旗舰大师"}}'::jsonb,
    display_order = 4,
    sort_order = 4,
    enabled = 1,
    is_active = 1,
    updated_at = now()
WHERE id = 'pro';

-- 3. 插入 Starter 套餐
INSERT INTO plans_config (id, name, billing_cycle, price_cny, price_usd, credits_included, monthly_cny, monthly_usd, features_json, sort_order, display_order, enabled, is_active, updated_at)
VALUES (
  'starter',
  'Starter (入门探索版)',
  'monthly',
  140.00,
  20.00,
  2000,
  140.00,
  20.00,
  '{"items": ["每月 2,000 + 400 额度 (多送20%)", "专享 Seedance 2.5 & 2.0 异步并发: 10", "单模型并发数: 5", "授权人像容量: 2 个", "资产库单素材快速生成", "去水印高清导出", "商业使用许可"], "meta": {"yearlyCny": 1399, "yearlyUsd": 199, "quotaBase": 2000, "quotaBonus": 400, "concurrency": 5, "asyncConcurrency": 10, "portraitCapacity": 2, "badge": "多送20%"}}'::jsonb,
  1,
  1,
  1,
  1,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cny = EXCLUDED.price_cny,
  price_usd = EXCLUDED.price_usd,
  monthly_cny = EXCLUDED.monthly_cny,
  monthly_usd = EXCLUDED.monthly_usd,
  credits_included = EXCLUDED.credits_included,
  features_json = EXCLUDED.features_json,
  display_order = EXCLUDED.display_order,
  sort_order = EXCLUDED.sort_order,
  enabled = EXCLUDED.enabled,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 4. 插入 Basic 套餐
INSERT INTO plans_config (id, name, billing_cycle, price_cny, price_usd, credits_included, monthly_cny, monthly_usd, features_json, sort_order, display_order, enabled, is_active, updated_at)
VALUES (
  'basic',
  'Basic (进阶创作者)',
  'monthly',
  350.00,
  50.00,
  5000,
  350.00,
  50.00,
  '{"items": ["每月 5,000 + 1,500 额度 (多送30%)", "专享 Seedance 2.5 & 2.0 异步并发: 20", "单模型并发数: 7", "授权人像容量: 5 个", "包含 Starter 全部特权", "去水印与极速优先生成通道"], "meta": {"yearlyCny": 3499, "yearlyUsd": 499, "quotaBase": 5000, "quotaBonus": 1500, "concurrency": 7, "asyncConcurrency": 20, "portraitCapacity": 5, "badge": "多送30%"}}'::jsonb,
  2,
  2,
  1,
  1,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cny = EXCLUDED.price_cny,
  price_usd = EXCLUDED.price_usd,
  monthly_cny = EXCLUDED.monthly_cny,
  monthly_usd = EXCLUDED.monthly_usd,
  credits_included = EXCLUDED.credits_included,
  features_json = EXCLUDED.features_json,
  display_order = EXCLUDED.display_order,
  sort_order = EXCLUDED.sort_order,
  enabled = EXCLUDED.enabled,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 5. 插入 Plus 套餐
INSERT INTO plans_config (id, name, billing_cycle, price_cny, price_usd, credits_included, monthly_cny, monthly_usd, features_json, sort_order, display_order, enabled, is_active, updated_at)
VALUES (
  'plus',
  'Plus (专业工作室)',
  'monthly',
  700.00,
  100.00,
  10000,
  700.00,
  100.00,
  '{"items": ["每月 10,000 + 4,000 额度 (多送40%)", "专享 Seedance 2.5 & 2.0 异步并发: 50", "单模型并发数: 10", "授权人像容量: 10 个", "图片视频 HD 超清增强", "真人多风格合规生成"], "meta": {"yearlyCny": 6999, "yearlyUsd": 999, "quotaBase": 10000, "quotaBonus": 4000, "concurrency": 10, "asyncConcurrency": 50, "portraitCapacity": 10, "badge": "多送40% · 人气推荐"}}'::jsonb,
  3,
  3,
  1,
  1,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cny = EXCLUDED.price_cny,
  price_usd = EXCLUDED.price_usd,
  monthly_cny = EXCLUDED.monthly_cny,
  monthly_usd = EXCLUDED.monthly_usd,
  credits_included = EXCLUDED.credits_included,
  features_json = EXCLUDED.features_json,
  display_order = EXCLUDED.display_order,
  sort_order = EXCLUDED.sort_order,
  enabled = EXCLUDED.enabled,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 6. 把旧的 team 方案隐藏
UPDATE plans_config SET enabled = 0, is_active = 0 WHERE id = 'team';
