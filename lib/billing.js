import 'server-only';

// Compatibility exports for historical imports. New routes must import the
// explicit application services directly; this module intentionally contains
// no database access or business implementation.
export {
  authenticateUser,
  clearSessionCookie,
  createOAuthUser,
  createSession,
  createUser,
  deleteSession,
  findOrCreateUserByPhone,
  getUserBySession,
  getUserFromRequest,
  hashToken,
  json,
  normalizeEmail,
  passwordHash,
  refreshSession,
  setSessionCookie,
  validateCredentials,
} from './services/auth.js';

export { createOrder, getEntitlements, getSubscription, updateOrder } from './services/billing.js';
export { getCreditBalance } from './services/credits.js';
export {
  deleteUserCreation as deleteCreation,
  getUserCreation as getCreationById,
  listUserGenerations as listCreations,
} from './services/generations.js';

/**
 * @deprecated The legacy direct-write path is intentionally disabled.
 * Use lib/services/generationCore.createGenerationTask instead.
 */
export async function recordCreation() {
  throw Object.assign(new Error('recordCreation 已废止，请使用 generationCore.createGenerationTask'), {
    code: 'LEGACY_CREATION_WRITE_DISABLED',
    status: 410,
  });
}
