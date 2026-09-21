import 'server-only';

import * as billingRepo from '../repositories/billing.js';
import * as creationRepo from '../repositories/creations.js';
import * as creditRepo from '../repositories/credits.js';
import * as moderationRepo from '../repositories/moderation.js';
import * as sessionRepo from '../repositories/sessions.js';
import * as settingsRepo from '../repositories/settings.js';
import * as userRepo from '../repositories/users.js';

// Admin read facade: route/page code must not depend on repository modules.
export async function listCreditLedger(searchParams) { return creditRepo.listCreditLedger(searchParams); }
export async function listAdmins() { return userRepo.listAdmins(); }
export async function listUsers(searchParams) { return userRepo.listUsers(searchParams); }
export async function listCreations(searchParams) { return creationRepo.listCreations(searchParams); }
export async function listFailedCreations(searchParams) { return creationRepo.listFailedCreations(searchParams); }
export async function getFailureClusters() { return creationRepo.getFailureClusters(); }
export async function getGenerationTrace(creationId) { return creationRepo.getGenerationTrace(creationId); }
export async function listModerationCases(searchParams) { return moderationRepo.listModerationCases(searchParams); }
export async function listActiveSessions(searchParams) { return sessionRepo.listActiveSessions(searchParams); }
export async function listOrders(searchParams) { return billingRepo.listOrders(searchParams); }
export async function listSubscriptions(searchParams) { return billingRepo.listSubscriptions(searchParams); }
export async function listWebhookEvents(searchParams) { return billingRepo.listWebhookEvents(searchParams); }
export async function getAllPlansConfig() { return settingsRepo.getAllPlansConfig(); }
