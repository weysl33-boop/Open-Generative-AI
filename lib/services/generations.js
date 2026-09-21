import 'server-only';

import { logAudit } from '../admin/audit.js';
import * as creationRepo from '../repositories/creations.js';
import { createModerationCase } from '../repositories/moderation.js';
import { createGenerationTask, processGenerationTask } from './generationCore.js';

export async function getGenerationTrace(creationId) {
  return creationRepo.getGenerationTrace(creationId);
}

export async function findCreationById(creationId) {
  return creationRepo.findCreationById(creationId);
}

export async function listAdminGenerations(searchParams) {
  return creationRepo.listCreations(searchParams);
}

export async function listFailedAdminGenerations(searchParams) {
  return creationRepo.listFailedCreations(searchParams);
}

export async function getAdminGenerationFailureClusters() {
  return creationRepo.getFailureClusters();
}

export async function listUserGenerations(userId, limit = 50, studioId = '') {
  return creationRepo.listUserCreations(userId, limit, studioId);
}

export async function getUserCreation(userId, creationId) {
  return creationRepo.getUserCreationById(userId, creationId);
}

export async function deleteUserCreation(userId, creationId) {
  return creationRepo.deleteUserCreation(userId, creationId);
}

export async function retryGenerationTask({ actor, creationId, requestId, idempotencyKey }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '原生成任务不存在' };

  let input = {};
  try { input = typeof original.input_summary_json === 'string' ? JSON.parse(original.input_summary_json) : (original.input_summary_json || {}); } catch {}
  const retryKey = `admin-retry:${original.id}:${idempotencyKey || requestId || Date.now()}`;
  const task = await createGenerationTask({
    userId: original.user_id,
    modelId: original.model,
    studioId: original.studio_id,
    prompt: input.prompt || original.label || '',
    parameters: input.parameters || input,
    idempotencyKey: retryKey,
    label: `重试：${original.label || original.model}`,
  });
  const processed = await processGenerationTask({ creationId: task.creation.id });

  await logAudit({
    actor,
    action: 'generations.retry',
    targetType: 'creation',
    targetId: original.id,
    riskLevel: 'medium',
    after: { retryCreationId: task.creation.id, chargeCredits: true, creditCost: task.creation.credit_cost },
    requestId,
  });

  return { creation: processed.creation || task.creation, processing: processed };
}

export async function flagCreationForModeration({ actor, creationId, reasonCode = 'manual_flag', requestId }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '目标生成记录不存在' };

  const modCase = await createModerationCase({
    creationId,
    reasonCode,
  });

  await logAudit({
    actor,
    action: 'moderation.flag',
    targetType: 'creation',
    targetId: creationId,
    riskLevel: 'low',
    after: { moderationCaseId: modCase.id, reasonCode },
    requestId,
  });

  return { moderationCase: modCase };
}
