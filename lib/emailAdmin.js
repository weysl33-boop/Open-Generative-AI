import 'server-only';

import { nowIso } from './db/index.js';
import { verifyAdminPassword } from './admin/authz.js';
import { logAudit } from './admin/audit.js';
import { EMAIL_SMTP_PROVIDER, getEmailSmtpConfiguration, getEmailSmtpPassword, QQ_EXMAIL_SMTP_HOST } from './emailConfig.js';
import { sendEmailSmtpTest as deliverEmailSmtpTest, verifyEmailSmtp } from './emailService.js';
import { saveSystemSetting } from './services/settings.js';
import * as providerRepo from './repositories/providers.js';
import * as sendLogRepo from './repositories/emailSendLogs.js';
import { consumeRateLimit } from './security/requestGuard.js';

export const listEmailSendLogs = sendLogRepo.listEmailSendLogs;
export const getEmailSendStats = sendLogRepo.getEmailSendStats;

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function getEmailSmtpOverview() {
  const [config, password, healthRows] = await Promise.all([
    getEmailSmtpConfiguration(),
    getEmailSmtpPassword(),
    providerRepo.getLatestHealthChecks(),
  ]);
  const health = healthRows.find((row) => row.provider === EMAIL_SMTP_PROVIDER) || null;
  const configured = Boolean(config.username && password);
  return {
    config,
    passwordConfigured: Boolean(password),
    configured,
    status: !config.enabled ? 'disabled' : !configured ? 'unavailable' : health?.status || 'not_checked',
    lastHealthCheck: health?.checked_at || null,
    lastHealthLatencyMs: health?.latency_ms ?? null,
    lastHealthError: health?.error_code || null,
    recommended: { host: QQ_EXMAIL_SMTP_HOST, port: 465, secure: true },
  };
}

export async function saveEmailSmtpConfiguration({ actor, body, requestId }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '邮箱配置格式无效' };
  const username = validEmail(body.username);
  if (body.username && !username) return { error: '请输入有效的 QQ 企业邮箱地址' };
  const fromName = String(body.fromName || 'KoyoSIM').trim();
  if (fromName.length > 100) return { error: '发件人名称不能超过 100 个字符' };

  // 密码与配置一次提交：填了新密码就必须重新验证管理员身份，留空则保留既有密钥。
  const nextPassword = typeof body.password === 'string' ? body.password.trim() : '';
  if (nextPassword) {
    if (!(await verifyAdminPassword(actor.id, body.adminPassword))) return { error: '管理员密码验证失败' };
    if (nextPassword.length < 8 || nextPassword.length > 1024) return { error: 'SMTP 客户端密码长度无效' };
    await providerRepo.saveProviderSecret({ provider: EMAIL_SMTP_PROVIDER, name: 'smtp_password', secretValue: nextPassword });
    await logAudit({
      actor,
      action: 'email.smtp.rotate_secret',
      targetType: 'email_provider',
      targetId: EMAIL_SMTP_PROVIDER,
      riskLevel: 'high',
      after: { secretName: 'smtp_password', updatedAt: nowIso() },
      requestId,
    });
  }

  const config = {
    enabled: body.enabled === true,
    host: QQ_EXMAIL_SMTP_HOST,
    port: 465,
    secure: true,
    username: username || '',
    fromName: fromName || 'KoyoSIM',
  };
  const saved = await saveSystemSetting({ actor, key: 'email_smtp', value: config, visibility: 'private', requestId });
  if (saved.error) return { error: saved.error };
  await logAudit({
    actor,
    action: 'email.smtp.configure',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'medium',
    after: { ...config, username: username ? `${username.slice(0, 2)}***@${username.split('@')[1]}` : '' },
    requestId,
  });
  return { success: true };
}

export async function runEmailSmtpHealthCheck({ actor, requestId }) {
  const result = await verifyEmailSmtp();
  await providerRepo.recordHealthCheck({
    provider: EMAIL_SMTP_PROVIDER,
    status: result.status,
    latencyMs: result.latencyMs,
    errorCode: result.errorCode,
    details: { probe: 'smtp_verify' },
  });
  await logAudit({
    actor,
    action: 'email.smtp.health_check',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'low',
    after: { status: result.status, latencyMs: result.latencyMs, errorCode: result.errorCode },
    requestId,
  });
  return result;
}

export async function sendEmailSmtpTest({ actor, to, requestId }) {
  const recipient = validEmail(to);
  if (!recipient) return { error: '请输入有效的测试收件邮箱' };
  const limit = await consumeRateLimit({ scope: 'admin_email_smtp_test', subject: actor.id, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return { error: '测试邮件发送过于频繁，请稍后再试', status: 429 };

  const result = await deliverEmailSmtpTest({ to: recipient, actorId: actor.id });
  await providerRepo.recordProviderCall({
    provider: EMAIL_SMTP_PROVIDER,
    action: 'test_send',
    requestId,
    status: 'success',
    latencyMs: result.latencyMs,
    usage: { recipientDomain: recipient.split('@')[1] },
  });
  await logAudit({
    actor,
    action: 'email.smtp.test_send',
    targetType: 'email_provider',
    targetId: EMAIL_SMTP_PROVIDER,
    riskLevel: 'medium',
    after: { recipientDomain: recipient.split('@')[1], latencyMs: result.latencyMs },
    requestId,
  });
  return { success: true, message: 'SMTP 服务已接受测试邮件；请检查收件箱及垃圾邮件文件夹。', latencyMs: result.latencyMs };
}
