import 'server-only';

import { hasProviderAdapter } from '../adapters/index.js';
import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import { channelAvailability, channelViewFromRow } from '../modelCenter/routing.js';
import { getProviderById, getProviderModelById, setChannelPrimary } from '../repositories/aiCatalog.js';
import * as modelsRepo from '../repositories/models.js';
import { resolveCreditValuation } from './creditValuation.js';
import { decorateModel } from './models.js';
import { getServerProviderApiKey } from './providerSecrets.js';

function sameModel(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

/**
 * 把「切换供应商」要校验的事实一次取齐：渠道归属、供应商状态、Adapter、凭据。
 * 判定复用 lib/modelCenter/routing.js，与后台列表和运行时路由器同一套口径。
 */
async function resolveChannel({ modelId, channelId, tx }) {
  const channel = await getProviderModelById(channelId, tx);
  if (!channel) return { error: '未找到目标供应商渠道' };
  if (!sameModel(channel.model_id, modelId)) {
    return { error: '目标渠道不属于该模型，已拒绝切换' };
  }
  const provider = await getProviderById(channel.provider_id, tx);
  if (!provider) return { error: '目标供应商不存在' };

  const view = channelViewFromRow(channel, provider, {
    adapterAvailable: hasProviderAdapter(provider.id) || hasProviderAdapter(provider.slug),
    credentialsConfigured: Boolean(await getServerProviderApiKey({ provider: provider.slug || provider.id })),
  });
  return { channel, provider, view };
}

/**
 * 设定模型的默认（主选）供应商渠道。
 *
 * 只写 provider_models.metadata 的钉选标记，不改 priority：priority 是运维调过的
 * 评分输入，被一次点击悄悄改写会让故障转移顺序变得无法解释。钉选在 smartRouter
 * 里优先于评分，因此「后台显示走哪家」与「运行时真的走哪家」保持一致。
 */
export async function setPrimaryProvider({ actor, modelId, channelId, requestId }) {
  if (!modelId) return { error: '缺少模型 ID' };
  if (!channelId) return { error: '请指定要设为默认供应商的渠道' };

  // 估值口径在事务外取：回读的那一行必须和快照用同一个数字，否则改接成功后
  // 前端整行的毛利会跟着弹一下。
  const { usdPerCredit } = await resolveCreditValuation();

  return await withTransaction(async (tx) => {
    const config = await modelsRepo.getModelById(modelId, tx);
    if (!config) return { error: '未找到指定模型配置' };

    const resolved = await resolveChannel({ modelId, channelId, tx });
    if (resolved.error) return resolved;

    const availability = channelAvailability(resolved.view);
    if (!availability.usable) {
      return { error: `目标渠道当前不可承接流量：${availability.reason}` };
    }

    const previous = (await modelsRepo.getModelWithOperations(modelId, tx))?.routes
      ?.filter((route) => route.isPrimary && route.id !== channelId)
      .map((route) => ({ channelId: route.id, providerId: route.providerSlug || route.providerId })) || [];

    const applied = await setChannelPrimary(modelId, channelId, tx);
    if (!applied) return { error: '默认供应商写入失败，已保持原供应商' };

    // 回读同一事务内的快照：前端拿到最新真值刷新该行，而不是自己猜一个新状态。
    const row = await modelsRepo.getModelWithOperations(modelId, tx);
    const model = row ? decorateModel(row, usdPerCredit) : null;

    await logAudit({
      actor,
      action: 'models.provider_switch',
      targetType: 'model',
      targetId: modelId,
      riskLevel: 'high',
      before: {
        previousPrimaryChannels: previous,
        modelsConfigProvider: config.provider,
      },
      after: {
        channelId,
        providerId: resolved.provider.slug || resolved.provider.id,
        providerModelId: resolved.channel.provider_model_id,
        channelCostUsd: resolved.view.baseCost,
        currency: resolved.view.currency,
      },
      requestId,
      transaction: tx,
    });

    return { success: true, model };
  });
}
