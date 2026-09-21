import 'server-only';

import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import * as legacyRepo from '../repositories/legacyCatalog.js';

// 对账老目录：只补不改。定价表在这里刻意不写 —— model_pricing 已被 019 按「千级积分」
// 刻度填满，而线上实际按 models_config 的 1–20 积分收费，选哪一套落价等于替全站用户
// 重新定价，属于商业决策；同步只把差异条数（gaps.legacy_pricing_mismatch）报出来。
export async function syncLegacyCatalog({ actor, requestId } = {}) {
  const result = await withTransaction(async (tx) => {
    const providers = await legacyRepo.syncGatewayProviders(tx);
    const models = await legacyRepo.syncCanonicalModelsFromLegacy(tx);
    const channels = await legacyRepo.syncProviderChannelsFromLegacy(tx);
    const directChannels = await legacyRepo.syncDirectProviderChannels(tx);
    const routingPolicies = await legacyRepo.syncRoutingPolicies(tx);
    const gaps = await legacyRepo.getCatalogGapSummary(tx);
    return { providers, models, channels, directChannels, routingPolicies, gaps };
  });

  const changed =
    result.providers + result.models + result.channels + result.directChannels + result.routingPolicies > 0;
  if (changed && actor) {
    await logAudit({
      actor,
      action: 'models.catalog_sync',
      targetType: 'model_catalog',
      targetId: 'legacy_reconcile',
      riskLevel: 'medium',
      after: {
        inserted_providers: result.providers,
        inserted_models: result.models,
        inserted_channels: result.channels,
        inserted_direct_channels: result.directChannels,
        inserted_routing_policies: result.routingPolicies,
        gaps: result.gaps,
      },
      requestId,
    });
  }

  const brands = await legacyRepo.listLegacyBrandSummary();
  return { ...result, brands, pricingSynced: false };
}

export async function getCatalogGaps() {
  return legacyRepo.getCatalogGapSummary();
}
