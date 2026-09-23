import 'server-only';

import nodemailer from 'nodemailer';
import { getEmailSmtpConfiguration, getEmailSmtpPassword } from './emailConfig.js';

function smtpErrorCode(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'SMTP_AUTH_FAILED';
  if (code.includes('TIMEOUT') || code === 'ETIMEDOUT') return 'SMTP_TIMEOUT';
  if (['ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) return 'SMTP_UNAVAILABLE';
  if (responseCode >= 400) return 'SMTP_REJECTED';
  return 'SMTP_ERROR';
}

function validEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function createEmailTransport({ requireEnabled = false } = {}) {
  const [config, password] = await Promise.all([
    getEmailSmtpConfiguration(),
    getEmailSmtpPassword(),
  ]);
  if ((requireEnabled && !config.enabled) || !config.username || !password) {
    throw Object.assign(new Error('SMTP credentials are not configured'), { code: 'SMTP_NOT_CONFIGURED' });
  }
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    logger: false,
    debug: false,
  });
  return { config, transporter };
}

async function logSend(entry) {
  try {
    const { recordEmailSendLog } = await import('./repositories/emailSendLogs.js');
    await recordEmailSendLog(entry);
  } catch (error) {
    console.error('[email/send-log]', { code: error?.code || 'SEND_LOG_FAILED' });
  }
}

async function deliverEmail({ to, subject, text, html, purpose, requireEnabled = false, userId = null, actorId = null }) {
  const recipient = validEmail(to);
  if (!recipient) {
    throw Object.assign(new Error('请输入有效的收件邮箱'), { code: 'EMAIL_INVALID_RECIPIENT' });
  }

  let transport;
  const startedAt = Date.now();
  if (!text && html) {
    text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  try {
    const created = await createEmailTransport({ requireEnabled });
    transport = created.transporter;
    const mailOptions = {
      from: { name: created.config.fromName || 'KoyoSIM', address: created.config.fromEmail || created.config.username },
      to: recipient,
      subject,
      headers: { 'X-Auto-Response-Suppress': 'All' },
    };
    if (text) mailOptions.text = text;
    if (html) mailOptions.html = html;
    const result = await transport.sendMail(mailOptions);
    if (!Array.isArray(result.accepted) || result.accepted.length === 0) {
      throw Object.assign(new Error(`SMTP server did not accept the ${purpose} recipient`), { code: 'SMTP_REJECTED' });
    }
    const latencyMs = Date.now() - startedAt;
    await logSend({ purpose, recipient, subject, body: text, status: 'success', latencyMs, userId, actorId });
    return { success: true, latencyMs };
  } catch (error) {
    const code = ['EMAIL_INVALID_RECIPIENT', 'SMTP_NOT_CONFIGURED'].includes(error?.code)
      ? error.code
      : smtpErrorCode(error);
    await logSend({
      purpose,
      recipient,
      subject,
      body: text,
      status: 'failed',
      errorCode: code,
      latencyMs: Date.now() - startedAt,
      userId,
      actorId,
    });
    console.error('[email/send]', { purpose, code });
    throw error;
  } finally {
    transport?.close();
  }
}

export async function verifyEmailSmtp() {
  let transport;
  const startedAt = Date.now();
  try {
    const created = await createEmailTransport();
    transport = created.transporter;
    await transport.verify();
    return { status: 'healthy', latencyMs: Date.now() - startedAt, errorCode: null };
  } catch (error) {
    const errorCode = error?.code === 'SMTP_NOT_CONFIGURED' ? error.code : smtpErrorCode(error);
    return { status: 'unavailable', latencyMs: Date.now() - startedAt, errorCode };
  } finally {
    transport?.close();
  }
}

export async function sendEmailSmtpTest({ to, actorId = null }) {
  const recipient = validEmail(to);
  if (!recipient) throw Object.assign(new Error('请输入有效的测试收件邮箱'), { code: 'EMAIL_INVALID_RECIPIENT' });

  try {
    return await deliverEmail({
      to: recipient,
      subject: '[KoyoSIM] QQ 企业邮箱 SMTP 配置测试',
      text: `这是一封 KoyoSIM 后台发出的 SMTP 连通性测试邮件。\n发送时间：${new Date().toISOString()}\n若你收到此邮件，说明当前 QQ 企业邮箱账号已接受该测试消息。`,
      purpose: 'test',
      actorId,
    });
  } catch (error) {
    if (error.code === 'EMAIL_INVALID_RECIPIENT') throw error;
    throw Object.assign(new Error('测试邮件发送失败，请检查后台 SMTP 配置和收件地址'), { code: error.code });
  }
}

export async function sendEmailVerificationCode({ to, code, userId = null }) {
  const recipient = validEmail(to);
  if (!recipient || !/^\d{6}$/.test(String(code || ''))) {
    throw Object.assign(new Error('Email verification input is invalid'), { code: 'EMAIL_VERIFICATION_INPUT_INVALID' });
  }

  try {
    return await deliverEmail({
      to: recipient,
      subject: 'KoyoSIM 安全邮箱验证码',
      text: `您的 KoyoSIM 安全邮箱验证码为 ${code}，10 分钟内有效。如非本人操作，请忽略此邮件。`,
      purpose: 'verification',
      requireEnabled: true,
      userId,
    });
  } catch (error) {
    if (['EMAIL_INVALID_RECIPIENT', 'EMAIL_VERIFICATION_INPUT_INVALID'].includes(error.code)) throw error;
    throw Object.assign(new Error('验证码邮件发送失败，请稍后重试'), { code: error.code });
  }
}

export async function sendGenericEmail({ to, subject, text, html, purpose = 'system', requireEnabled = false, userId = null, actorId = null }) {
  return deliverEmail({ to, subject, text, html, purpose, requireEnabled, userId, actorId });
}

