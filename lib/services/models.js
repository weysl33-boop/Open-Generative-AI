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

  logAudit({
    actor_id: actor.id,
    actor_email: actor.email,
    action: 'models.update',
    target_type: 'model',
    target_id: id,
    risk_level: 'medium',
    details: {
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
    request_id: requestId,
  });

  return { success: true, model: updated };
}
