import 'server-only';

import { queryOne, queryMany, execute } from '../db/index.js';

export function parseFeaturesAndMeta(value, planId = '') {
  let features = [];
  let meta = {};

  if (Array.isArray(value)) {
    features = value;
  } else if (value && typeof value === 'object') {
    features = Array.isArray(value.items) ? value.items : (Array.isArray(value.features) ? value.features : []);
    meta = value.meta || value;
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        features = parsed;
      } else if (parsed && typeof parsed === 'object') {
        features = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.features) ? parsed.features : []);
        meta = parsed.meta || parsed;
      }
    } catch {}
  }

  // 套餐基准默认值 fallback
  const defaultsByPlan = {
    starter: { yearlyCny: 1399, yearlyUsd: 199, quotaBase: 2000, quotaBonus: 400, concurrency: 5, asyncConcurrency: 10, portraitCapacity: 2, badge: '多送20%' },
    basic: { yearlyCny: 3499, yearlyUsd: 499, quotaBase: 5000, quotaBonus: 1500, concurrency: 7, asyncConcurrency: 20, portraitCapacity: 5, badge: '多送30%' },
    plus: { yearlyCny: 6999, yearlyUsd: 999, quotaBase: 10000, quotaBonus: 4000, concurrency: 10, asyncConcurrency: 50, portraitCapacity: 10, badge: '多送40% · 人气推荐' },
    pro: { yearlyCny: 13999, yearlyUsd: 1999, quotaBase: 20000, quotaBonus: 10000, concurrency: 15, asyncConcurrency: 80, portraitCapacity: 20, badge: '多送50% · 旗舰大师' },
    free: { yearlyCny: 0, yearlyUsd: 0, quotaBase: 0, quotaBonus: 0, concurrency: 2, asyncConcurrency: 3, portraitCapacity: 0, badge: '免费体验' },
  };

  const idKey = String(planId || '').toLowerCase();
  const def = defaultsByPlan[idKey] || { yearlyCny: 0, yearlyUsd: 0, quotaBase: 0, quotaBonus: 0, concurrency: 2, asyncConcurrency: 3, portraitCapacity: 0, badge: '' };

  return {
    features,
    meta: {
      yearlyCny: Number(meta.yearlyCny ?? meta.yearly_cny ?? def.yearlyCny),
      yearlyUsd: Number(meta.yearlyUsd ?? meta.yearly_usd ?? def.yearlyUsd),
      quotaBase: Number(meta.quotaBase ?? meta.quota_base ?? def.quotaBase),
      quotaBonus: Number(meta.quotaBonus ?? meta.quota_bonus ?? def.quotaBonus),
      concurrency: Number(meta.concurrency ?? def.concurrency),
      asyncConcurrency: Number(meta.asyncConcurrency ?? def.asyncConcurrency),
      portraitCapacity: Number(meta.portraitCapacity ?? def.portraitCapacity),
      badge: String(meta.badge || def.badge || ''),
      featureGroups: meta.featureGroups && typeof meta.featureGroups === 'object' ? meta.featureGroups : null,
    },
  };
}

export function mapPlanConfig(row) {
  if (!row) return null;
  const { features, meta } = parseFeaturesAndMeta(row.features_json ?? row.features, row.id);

  return {
    id: row.id,
    name: row.name,
    monthlyCny: Number(row.monthly_cny || 0),
    monthlyUsd: Number(row.monthly_usd || 0),
    yearlyCny: meta.yearlyCny,
    yearlyUsd: meta.yearlyUsd,
    quotaBase: meta.quotaBase,
    quotaBonus: meta.quotaBonus,
    concurrency: meta.concurrency,
    asyncConcurrency: meta.asyncConcurrency,
    portraitCapacity: meta.portraitCapacity,
    badge: meta.badge,
    featureGroups: meta.featureGroups,
    features,
    meta,
    displayOrder: Number(row.display_order || 0),
    enabled: Number(row.enabled) === 1 || row.enabled === true,
    updatedAt: row.updated_at || null,
  };
}

export async function ensureCommercialPlans() {
  const defaults = [
    {
      id: 'starter',
      name: 'Starter (入门探索版)',
      monthly_cny: 140,
      monthly_usd: 20,
      display_order: 1,
      enabled: true,
      features_json: {
        items: [
          '每月 2,000 + 400 额度 (多送20%)',
          '专享 Seedance 2.5 & 2.0 异步并发: 10',
          '单模型并发数: 5',
          '授权人像容量: 2 个',
          '资产库单素材快速生成',
          '去水印高清导出',
          '商业使用许可'
        ],
        meta: {
          yearlyCny: 1399,
          yearlyUsd: 199,
          quotaBase: 2000,
          quotaBonus: 400,
          concurrency: 5,
          asyncConcurrency: 10,
          portraitCapacity: 2,
          badge: '多送20%',
          featureGroups: {
            video: ['Seedance 2.0/2.5 Pro / Fast / mini', '专享异步并发通道：10 路', '单模型并发：5 路'],
            image: ['Flova Image 2.5 Sunburst / Flare', '全站模型限时低至 6 折'],
            more: ['授权人像容量：2 个', '资产库单素材快速生成', '去水印高清导出', '商业使用许可']
          }
        }
      }
    },
    {
      id: 'basic',
      name: 'Basic (进阶创作者)',
      monthly_cny: 350,
      monthly_usd: 50,
      display_order: 2,
      enabled: true,
      features_json: {
        items: [
          '每月 5,000 + 1,500 额度 (多送30%)',
          '专享 Seedance 2.5 & 2.0 异步并发: 20',
          '单模型并发数: 7',
          '授权人像容量: 5 个',
          '包含 Starter 全部特权',
          '去水印与极速优先生成通道'
        ],
        meta: {
          yearlyCny: 3499,
          yearlyUsd: 499,
          quotaBase: 5000,
          quotaBonus: 1500,
          concurrency: 7,
          asyncConcurrency: 20,
          portraitCapacity: 5,
          badge: '多送30%',
          featureGroups: {
            video: ['Seedance 2.5 专享异步并发：20 路', '单模型并发：7 路', '包含 Starter 全部特权'],
            image: ['Flova 4K 极清超采样支持', '图片生成全线享专属低折'],
            more: ['授权人像容量：5 个', '极速优先生成通道（免排队）', '专属人像训练加速', '商业商用授权全面支持']
          }
        }
      }
    },
    {
      id: 'plus',
      name: 'Plus (专业工作室)',
      monthly_cny: 700,
      monthly_usd: 100,
      display_order: 3,
      enabled: true,
      features_json: {
        items: [
          '每月 10,000 + 4,000 额度 (多送40%)',
          '专享 Seedance 2.5 & 2.0 异步并发: 50',
          '单模型并发数: 10',
          '授权人像容量: 10 个',
          '图片视频 HD 超清增强',
          '真人多风格合规生成'
        ],
        meta: {
          yearlyCny: 6999,
          yearlyUsd: 999,
          quotaBase: 10000,
          quotaBonus: 4000,
          concurrency: 10,
          asyncConcurrency: 50,
          portraitCapacity: 10,
          badge: '多送40% · 人气推荐',
          featureGroups: {
            video: ['Seedance 2.5 专享异步并发：50 路', '单模型并发：10 路', '视频 HD 超清增强'],
            image: ['多风格真人极速生成', '批量图片极速批量出图'],
            more: ['授权人像容量：10 个', '极速 VIP 专用 GPU 集群', '优先服务保障', '专属素材资产库空间']
          }
        }
      }
    },
    {
      id: 'pro',
      name: 'Pro (旗舰大师版)',
      monthly_cny: 1400,
      monthly_usd: 200,
      display_order: 4,
      enabled: true,
      features_json: {
        items: [
          '每月 20,000 + 10,000 额度 (多送50%)',
          '专享 Seedance 2.5 & 2.0 异步并发: 80',
          '单模型并发数: 15',
          '授权人像容量: 20 个',
          '图片视频 4K 极清超采样',
          '多语言真人双风格极速生成',
          'VIP 1对1 专属技术支持与企业级 SLA'
        ],
        meta: {
          yearlyCny: 13999,
          yearlyUsd: 1999,
          quotaBase: 20000,
          quotaBonus: 10000,
          concurrency: 15,
          asyncConcurrency: 80,
          portraitCapacity: 20,
          badge: '多送50% · 旗舰大师',
          featureGroups: {
            video: ['Seedance 2.5 专享异步并发：80 路', '单模型并发：15 路', '影视级无限长镜头与高码率'],
            image: ['4K 极清超采样顶级画质', '全站模型享受底价折扣'],
            more: ['授权人像容量：20 个', 'VIP 1对1 专属技术顾问', '企业级 SLA 保障与增值税发票', '优先体验最新 SOTA 模型']
          }
        }
      }
    }
  ];

  try {
    // 清理历史遗留套餐中的 BYOK 字样
    await execute(`
      UPDATE plans_config
      SET name = '免费体验版',
          features_json = '["基础图片与视频工作流", "每日签到赠送算力", "全站免Key云端托管推理"]'::jsonb
      WHERE id = 'free' AND name LIKE '%BYOK%'
    `);

    for (const p of defaults) {
      await execute(`
        INSERT INTO plans_config (id, name, billing_cycle, price_cny, price_usd, credits_included, monthly_cny, monthly_usd, features_json, sort_order, display_order, enabled, is_active, updated_at)
        VALUES ($1, $2, 'monthly', $3, $4, $5, $3, $4, $6::jsonb, $7, $7, TRUE, TRUE, now())
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
          updated_at = now()
      `, [p.id, p.name, p.monthly_cny, p.monthly_usd, p.features_json.meta?.quotaBase || 0, JSON.stringify(p.features_json), p.display_order]);
    }
  } catch (err) {
    console.error('[ensureCommercialPlans error]', err.message);
  }
}

export async function listPublicPlans() {
  const rows = await queryMany(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE enabled = TRUE
    ORDER BY display_order ASC, id ASC
  `);
  return rows.map(mapPlanConfig);
}

export async function findPublicPlanById(id) {
  return mapPlanConfig(await queryOne(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE id = $1 AND enabled = TRUE
  `, [id]));
}

export async function findPublicPlanByIdTx(tx, id) {
  if (!tx || typeof tx.queryOne !== 'function') throw new TypeError('transaction is required');
  return mapPlanConfig(await tx.queryOne(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE id = $1 AND enabled = TRUE
  `, [id]));
}
