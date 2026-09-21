import 'server-only';

import { withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as userRepo from '../repositories/users.js';
import * as billingRepo from '../repositories/billing.js';
import * as creationRepo from '../repositories/creations.js';
import * as sessionRepo from '../repositories/sessions.js';
import * as noteRepo from '../repositories/notes.js';
import { listUserCreditLedger } from '../repositories/credits.js';
import { getCreditWallet } from '../financial/creditService.js';
import { getCurrencyWallet } from '../financial/currencyService.js';

export async function getUserDetailFull(userId) {
  const user = await userRepo.findUserById(userId);
  if (!user) return null;

  const [
    subsRes,
    ordersRes,
    creationsRes,
    ledgerRes,
    sessionsRes,
    notesRes,
    auditRes,
    allTags,
    creditWalletRes,
    currencyWalletRes
  ] = await Promise.all([
    creationRepo.listUserSubscriptions(userId, 20).catch(() => []),

    billingRepo.listUserOrders(userId, 20).catch(() => []),

    creationRepo.listUserCreationSummaries(userId, 20).catch(() => []),

    listUserCreditLedger(userId, 20).catch(() => []),
    sessionRepo.listUserSessions(userId).catch(() => []),
    noteRepo.listNotes('user', userId).catch(() => []),

    userRepo.listUserAuditLogs(userId, 20).catch(() => []),
    userRepo.listAllTags().catch(() => []),
    getCreditWallet(userId).catch(() => null),
    getCurrencyWallet(userId).catch(() => null),
  ]);

  return {
    user,
    creditWallet: creditWalletRes || null,
    currencyWallet: currencyWalletRes || null,
    subscriptions: subsRes || [],
    orders: ordersRes || [],
    creations: creationsRes || [],
    ledger: ledgerRes || [],
    sessions: sessionsRes || [],
    notes: notesRes || [],
    audit: auditRes || [],
    allTags: allTags || [],
  };
}

export async function setUserStatus({ actor, userId, status, requestId }) {
  if (!['active', 'suspended'].includes(status)) {
    return { error: '无效的用户状态参数' };
  }

  return await withTransaction(async (tx) => {
    const user = await userRepo.findUserById(userId, tx);
    if (!user) return { error: '用户不存在' };
    const updated = await userRepo.updateUserStatus(userId, status, tx);
    const revokedCount = status === 'suspended' ? await sessionRepo.revokeAllUserSessions(userId, tx) : 0;
    await logAudit({
      actor,
      action: status === 'suspended' ? 'users.suspend' : 'users.activate',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'high',
      before: { status: user.status },
      after: { status, revokedCount },
      requestId,
      transaction: tx,
    });
    return { user: updated };
  });
}

export async function setUserRole({ actor, userId, role, requestId }) {
  const allowedRoles = ['super_admin', 'operations_admin', 'finance_admin', 'support_admin', 'auditor', 'user'];
  if (!allowedRoles.includes(role)) {
    return { error: '无效的角色类型' };
  }

  return await withTransaction(async (tx) => {
    const user = await userRepo.findUserById(userId, tx);
    if (!user) return { error: '用户不存在' };
    if (user.id === actor.id && role !== 'super_admin') {
      return { error: '不能自我降级超级管理员角色' };
    }
    const updated = await userRepo.updateUserRole(userId, role, tx);
    const revokedCount = await sessionRepo.revokeAllUserSessions(userId, tx);
    await logAudit({
      actor,
      action: 'admins.change_role',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'high',
      before: { role: user.role },
      after: { role, revokedCount },
      requestId,
      transaction: tx,
    });
    return { user: updated };
  });
}

export async function manageUserTag({ actor, userId, tagId, action = 'add', requestId }) {
  return await withTransaction(async (tx) => {
    const user = await userRepo.findUserById(userId, tx);
    if (!user) return { error: '用户不存在' };
    if (action === 'add') {
      await userRepo.addUserTag(userId, tagId, actor.email || actor.id, tx);
    } else if (action === 'remove') {
      await userRepo.removeUserTag(userId, tagId, tx);
    } else {
      return { error: '无效的标签操作' };
    }
    await logAudit({
      actor,
      action: action === 'add' ? 'users.tag_add' : 'users.tag_remove',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'low',
      after: { tagId, action },
      requestId,
      transaction: tx,
    });
    const refreshed = await userRepo.findUserById(userId, tx);
    return { user: refreshed };
  });
}

export async function revokeUserSessions({ actor, userId, requestId }) {
  return await withTransaction(async (tx) => {
    const user = await userRepo.findUserById(userId, tx);
    if (!user) return { error: '用户不存在' };
    const revokedCount = await sessionRepo.revokeAllUserSessions(userId, tx);
    await logAudit({
      actor,
      action: 'sessions.revoke_all',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'medium',
      after: { revokedCount },
      requestId,
      transaction: tx,
    });
    return { revokedCount };
  });
}

export async function addUserAdminNote({ actor, userId, body, requestId }) {
  if (!body || !body.trim()) {
    return { error: '备注内容不能为空' };
  }

  return await withTransaction(async (tx) => {
    const note = await noteRepo.addNote({
      targetType: 'user',
      targetId: userId,
      body: body.trim(),
      authorId: actor.id,
      authorEmail: actor.email,
      transaction: tx,
    });
    await logAudit({
      actor,
      action: 'notes.create',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'low',
      after: { noteId: note.id },
      requestId,
      transaction: tx,
    });
    return { note };
  });
}
