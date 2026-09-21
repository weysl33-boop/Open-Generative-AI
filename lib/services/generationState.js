export const GENERATION_STATUS = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const TRANSITIONS = new Map([
  [GENERATION_STATUS.QUEUED, new Set([GENERATION_STATUS.PROCESSING, GENERATION_STATUS.CANCELLED])],
  [GENERATION_STATUS.PROCESSING, new Set([GENERATION_STATUS.SUCCEEDED, GENERATION_STATUS.FAILED, GENERATION_STATUS.CANCELLED])],
  [GENERATION_STATUS.SUCCEEDED, new Set()],
  [GENERATION_STATUS.FAILED, new Set()],
  [GENERATION_STATUS.CANCELLED, new Set()],
]);

export function canTransitionGeneration(fromStatus, toStatus) {
  return Boolean(TRANSITIONS.get(fromStatus)?.has(toStatus));
}

export function assertGenerationTransition(fromStatus, toStatus) {
  if (!canTransitionGeneration(fromStatus, toStatus)) {
    throw Object.assign(new Error(`不允许的生成任务状态转换: ${fromStatus} -> ${toStatus}`), { code: 'INVALID_GENERATION_TRANSITION' });
  }
  return true;
}
