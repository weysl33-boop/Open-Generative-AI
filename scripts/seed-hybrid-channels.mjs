import 'server-only';
import { execute, queryMany } from '../lib/db/index.js';

/**
 * 完整填充全平台所有主流模型的混合多渠道通道映射 (Provider Models)
 * 涵盖 Kling、MiniMax、Alibaba DashScope、OpenAI、Google、Runway、Luma
 */
export async function seedHybridChannels() {
  console.log('开始填充多供应商混合通道映射 (ProviderModels)...');

  const mappings = [
    // === Kling 可灵官方通道 ===
    { model_id: 'kling-2.6', provider_id: 'kling', provider_model_id: 'kling-v2-6', cost: 0.20, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.1-master-t2v', provider_id: 'kling', provider_model_id: 'kling-v2-1-master', cost: 0.15, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.5-turbo-pro-t2v', provider_id: 'kling', provider_model_id: 'kling-v2-5-turbo', cost: 0.18, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.6-pro-t2v', provider_id: 'kling', provider_model_id: 'kling-v2-6-pro', cost: 0.22, currency: 'CNY', priority: 100 },
    { model_id: 'kling-o1-text-to-video', provider_id: 'kling', provider_model_id: 'kling-o1', cost: 0.25, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.1-master-i2v', provider_id: 'kling', provider_model_id: 'kling-v2-1-master-i2v', cost: 0.15, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.1-standard-i2v', provider_id: 'kling', provider_model_id: 'kling-v2-1-std-i2v', cost: 0.12, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v3.0-standard-text-to-video', provider_id: 'kling', provider_model_id: 'kling-v3-0-std', cost: 0.20, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v3.0-standard-image-to-video', provider_id: 'kling', provider_model_id: 'kling-v3-0-std-i2v', cost: 0.20, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v3.0-pro-recast', provider_id: 'kling', provider_model_id: 'kling-v3-0-recast', cost: 0.28, currency: 'CNY', priority: 100 },
    { model_id: 'kling-v2.6-std-motion-control', provider_id: 'kling', provider_model_id: 'kling-v2-6-motion', cost: 0.25, currency: 'CNY', priority: 100 },

    // === MiniMax / 海螺官方通道 ===
    { model_id: 'hailuo-02', provider_id: 'minimax', provider_model_id: 'video-01', cost: 0.18, currency: 'CNY', priority: 100 },
    { model_id: 'minimax-hailuo-2.3-standard-t2v', provider_id: 'minimax', provider_model_id: 'video-01-t2v', cost: 0.16, currency: 'CNY', priority: 100 },
    { model_id: 'minimax-hailuo-2.3-standard-i2v', provider_id: 'minimax', provider_model_id: 'video-01-i2v', cost: 0.16, currency: 'CNY', priority: 100 },
    { model_id: 'minimax-speech-2.6-hd', provider_id: 'minimax', provider_model_id: 'speech-01-hd', cost: 0.02, currency: 'CNY', priority: 100 },
    { model_id: 'minimax-speech-2.6-turbo', provider_id: 'minimax', provider_model_id: 'speech-01-turbo', cost: 0.01, currency: 'CNY', priority: 100 },
    { model_id: 'minimax-voice-clone', provider_id: 'minimax', provider_model_id: 'voice-clone-01', cost: 0.05, currency: 'CNY', priority: 100 },

    // === 阿里云百炼 / DashScope (Wan 万相) 官方通道 ===
    { model_id: 'wan-2.1', provider_id: 'alibaba', provider_model_id: 'wanx2.1-t2v-plus', cost: 0.14, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.1-text-to-image', provider_id: 'alibaba', provider_model_id: 'wanx2.1-t2i-turbo', cost: 0.02, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.1-image-to-video', provider_id: 'alibaba', provider_model_id: 'wanx2.1-i2v-plus', cost: 0.14, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.2-image-to-video', provider_id: 'alibaba', provider_model_id: 'wanx2.2-i2v-plus', cost: 0.16, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.1-t2v-14b', provider_id: 'alibaba', provider_model_id: 'wanx2.1-t2v-14b', cost: 0.18, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.1-i2v-14b', provider_id: 'alibaba', provider_model_id: 'wanx2.1-i2v-14b', cost: 0.18, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.2-edit-video', provider_id: 'alibaba', provider_model_id: 'wanx2.2-v2v-edit', cost: 0.15, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.2-speech-to-video', provider_id: 'alibaba', provider_model_id: 'wanx2.2-s2v', cost: 0.15, currency: 'CNY', priority: 100 },
    { model_id: 'wan2.2-animate-recast', provider_id: 'alibaba', provider_model_id: 'wanx2.2-animate', cost: 0.20, currency: 'CNY', priority: 100 },

    // === OpenAI 官方通道 ===
    { model_id: 'gpt4o-text-to-image', provider_id: 'openai', provider_model_id: 'dall-e-3', cost: 0.040, currency: 'USD', priority: 100 },
    { model_id: 'gpt-image', provider_id: 'openai', provider_model_id: 'dall-e-3', cost: 0.040, currency: 'USD', priority: 100 },
    { model_id: 'flux-1.1-pro', provider_id: 'openai', provider_model_id: 'flux-1.1-pro-direct', cost: 0.035, currency: 'USD', priority: 90 },

    // === Google 官方通道 ===
    { model_id: 'imagen-4', provider_id: 'google', provider_model_id: 'imagen-3.0-generate-002', cost: 0.030, currency: 'USD', priority: 100 },
    { model_id: 'veo-2-text-to-video', provider_id: 'google', provider_model_id: 'veo-2.0-generate-001', cost: 0.250, currency: 'USD', priority: 100 },
    { model_id: 'veo-2-image-to-video', provider_id: 'google', provider_model_id: 'veo-2.0-i2v-001', cost: 0.250, currency: 'USD', priority: 100 },
    { model_id: 'veo3-image-to-video', provider_id: 'google', provider_model_id: 'veo-3.0-i2v', cost: 0.350, currency: 'USD', priority: 100 },
    { model_id: 'veo3-fast-image-to-video', provider_id: 'google', provider_model_id: 'veo-3.0-fast-i2v', cost: 0.280, currency: 'USD', priority: 100 },

    // === Runway 官方通道 ===
    { model_id: 'runway-image-to-video', provider_id: 'runway', provider_model_id: 'gen3a_turbo', cost: 0.150, currency: 'USD', priority: 100 },
    { model_id: 'runway-aleph-v2v', provider_id: 'runway', provider_model_id: 'gen3a_aleph_v2v', cost: 0.200, currency: 'USD', priority: 100 },
    { model_id: 'runway-act-two-recast', provider_id: 'runway', provider_model_id: 'act_two', cost: 0.250, currency: 'USD', priority: 100 },

    // === Luma 官方通道 ===
    { model_id: 'luma-dream-machine', provider_id: 'luma', provider_model_id: 'dream-machine-v1.5', cost: 0.160, currency: 'USD', priority: 100 },
  ];

  let inserted = 0;
  for (const m of mappings) {
    const channelId = `pm_${m.model_id.replace(/[^a-zA-Z0-9]/g, '_')}_${m.provider_id}`;
    const costConfig = JSON.stringify({
      currency: m.currency,
      base_cost: m.cost,
    });

    await execute(`
      INSERT INTO ai_studio.provider_models (
        id, model_id, provider_id, provider_model_id, enabled, priority,
        cost_config, parameter_mapping, capabilities, endpoint_config,
        timeout, max_retries, supports_webhook, supports_polling,
        concurrency_limit, rate_limit, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, true, $5,
        $6::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
        180000, 3, false, true,
        20, 120, '{}'::jsonb, NOW(), NOW()
      )
      ON CONFLICT (model_id, provider_id, provider_model_id) DO UPDATE SET
        priority = EXCLUDED.priority,
        cost_config = EXCLUDED.cost_config,
        enabled = true,
        updated_at = NOW()
    `, [channelId, m.model_id, m.provider_id, m.provider_model_id, m.priority, costConfig]);

    inserted++;
  }

  console.log(`成功写入/更新 ${inserted} 个官方直连通道映射！`);

  // 检查并确保对应的规范模型路由策略支持 Failover
  const distinctModelIds = [...new Set(mappings.map((m) => m.model_id))];
  for (const modelId of distinctModelIds) {
    await execute(`
      INSERT INTO ai_studio.routing_policies (
        id, model_id, routing_mode, weights, failover_enabled, created_at, updated_at
      ) VALUES (
        $1, $2, 'balanced', '{"cost": 0.4, "success_rate": 0.3, "speed": 0.2, "capacity": 0.1}'::jsonb, true, NOW(), NOW()
      )
      ON CONFLICT (model_id) DO UPDATE SET
        failover_enabled = true,
        updated_at = NOW()
    `, [`rp_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`, modelId]);
  }

  console.log(`成功同步 ${distinctModelIds.length} 个模型的智能路由策略！`);
}

seedHybridChannels()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
