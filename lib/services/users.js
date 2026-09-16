import 'server-only';

import { query, queryOne, execute, nowIso } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as userRepo from '../repositories/users.js';
import * as sessionRepo from '../repositories/sessions.js';
import * as noteRepo from '../repositories/notes.js';
import { listUserCreditLedger } from '../repositories/credits.js';

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
    allTags
  ] = await Promise.all([
    query(`
      SELECT id, provider, plan_id, status, current_period_end, created_at, updated_at
      FROM subscriptions WHERE user_id = $1
      ORDER BY updated_at DESC LIMIT 20
    `, [userId]).catch(() => ({ rows: [] })),

    query(`
      SELECT id, provider, plan_id, status, amount_minor, currency, provider_order_id, created_at, updated_at
      FROM orders WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [userId]).catch(() => ({ rows: [] })),

    query(`
      SELECT id, studio_id, label, result_url, status, credit_cost, created_at
      FROM creations WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [userId]).catch(() => ({ rows: [] })),

    listUserCreditLedger(userId, 20).catch(() => []),
    sessionRepo.listUserSessions(userId).catch(() => []),
    noteRepo.listNotes('user', userId).catch(() => []),

    query(`
      SELECT id, actor_email, action, target_type, target_id, risk_level, created_at
      FROM admin_audit_logs
      WHERE target_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [userId]).catch(() => ({ rows: [] })),

    userRepo.listAllTags().catch(() => [])
  ]);

  return {
    user,
    subscriptions: subsRes.rows || [],
    orders: ordersRes.rows || [],
    creations: creationsRes.rows || [],
    ledger: ledgerRes || [],
    sessions: sessionsRes || [],
    notes: notesRes || [],
    audit: auditRes.rows || [],
    allTags: allTags || [],
  };
}

export async function setUserStatus({ actor, userId, status, requestId }) {
  if (!['active', 'suspended'].includes(status)) {
    return { error: '无效的用户状态参数' };
  }

  const user = await userRepo.findUserById(userId);
  if (!user) return { error: '用户不存在' };

  const updated = await userRepo.updateUserStatus(userId, status);
  if (status === 'suspended') {
    try {
      await sessionRepo.revokeAllUserSessions(userId);
    } catch {}
  }

  try {
    await logAudit({
      actor,
      action: status === 'suspended' ? 'users.suspend' : 'users.activate',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'high',
      before: { status: user.status },
      after: { status },
      requestId,
    });
  } catch {}

  return { user: updated };
}

export async function setUserRole({ actor, userId, role, requestId }) {
  const allowedRoles = ['super_admin', 'operations_admin', 'finance_admin', 'support_admin', 'auditor', 'user'];
  if (!allowedRoles.includes(role)) {
    return { error: '无效的角色类型' };
  }

  const user = await userRepo.findUserById(userId);
  if (!user) return { error: '用户不存在' };

  if (user.id === actor.id && role !== 'super_admin') {
    return { error: '不能自我降级超级管理员角色' };
  }

  const updated = await userRepo.updateUserRole(userId, role);
  try {
    await sessionRepo.revokeAllUserSessions(userId);
  } catch {}

  try {
    await logAudit({
      actor,
      action: 'admins.change_role',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'high',
      before: { role: user.role },
      after: { role },
      requestId,
    });
  } catch {}

  return { user: updated };
}

export async function manageUserTag({ actor, userId, tagId, action = 'add', requestId }) {
  const user = await userRepo.findUserById(userId);
  if (!user) return { error: '用户不存在' };

  if (action === 'add') {
    await userRepo.addUserTag(userId, tagId, actor.email || actor.id);
  } else if (action === 'remove') {
    await userRepo.removeUserTag(userId, tagId);
  } else {
    return { error: '无效的标签操作' };
  }

  try {
    await logAudit({
      actor,
      action: action === 'add' ? 'users.tag_add' : 'users.tag_remove',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'low',
      after: { tagId, action },
      requestId,
    });
  } catch {}

  const refreshed = await userRepo.findUserById(userId);
  return { user: refreshed };
}

export async function revokeUserSessions({ actor, userId, requestId }) {
  const user = await userRepo.findUserById(userId);
  if (!user) return { error: '用户不存在' };

  const revokedCount = await sessionRepo.revokeAllUserSessions(userId);
  try {
    await logAudit({
      actor,
      action: 'sessions.revoke_all',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'medium',
      after: { revokedCount },
      requestId,
    });
  } catch {}

  return { revokedCount };
}

export async function addUserAdminNote({ actor, userId, body, requestId }) {
  if (!body || !body.trim()) {
    return { error: '备注内容不能为空' };
  }

  const note = await noteRepo.addNote({
    targetType: 'user',
    targetId: userId,
    body: body.trim(),
    authorId: actor.id,
    authorEmail: actor.email,
  });

  try {
    await logAudit({
      actor,
      action: 'notes.create',
      targetType: 'user',
      targetId: userId,
      riskLevel: 'low',
      after: { noteId: note.id },
      requestId,
    });
  } catch {}

  return { note };
}
