import { logAudit } from '../admin/audit.js';
import * as modelsRepo from '../repositories/models.js';

export async function getAllModelsOverview() {
  return await modelsRepo.listAllModels();
}

export async function updateModel({ actor, id, updates, requestId }) {
  const previous = await modelsRepo.getModelById(id);
  if (!previous) {
    return { error: '未找到指定模型配置' };
  }

  const updated = await modelsRepo.updateModelConfig(id, updates);

  await logAudit({
    actor,
    action: 'models.update',
    targetType: 'model',
    targetId: id,
    riskLevel: 'medium',
    after: {
      previous: {
        cost_usd: previous.cost_usd,
        credits_price: previous.credits_price,
        is_active: previous.is_active,
      },
      updated: {
        cost_usd: updated.cost_usd,
        credits_price: updated.credits_price,
        is_active: updated.is_active,
      },
    },
    requestId,
  });

  return { success: true, model: updated };
}
