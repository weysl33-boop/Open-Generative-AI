import 'server-only';

import { sendGenericEmail } from './emailService.js';
import { getEmailSmtpConfiguration } from './emailConfig.js';
import { consumeRateLimit } from './security/requestGuard.js';
import * as providerRepo from './repositories/providers.js';
import { logAudit } from './admin/audit.js';

export {
  MARKETING_TEMPLATES,
  renderMarketingTemplate,
  htmlToPlainText,
} from './emailMarketingTemplates.js';

import {
  MARKETING_TEMPLATES,
  renderMarketingTemplate,
  htmlToPlainText,
} from './emailMarketingTemplates.js';

/**
 * 触发用户邮箱注册欢迎邮件（异步、解耦、容错）
 */
export async function sendWelcomeEmail({ to, name = '', userId = null }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { success: false, error: '收件邮箱为空' };

  try {
    const config = await getEmailSmtpConfiguration();
    if (!config.enabled || !config.username) {
      console.warn('[email/welcome] SMTP 未启用或未配置，跳过发送欢迎邮件');
      return { success: false, skipped: true, reason: 'SMTP_DISABLED' };
    }

    const template = MARKETING_TEMPLATES.welcome;
    const variables = {
      name: name || recipient.split('@')[0],
      email: recipient,
      action_url: 'https://www.koyosim.com/studio',
      initial_credits: '10',
      brand_name: config.fromName || 'KoyoSIM',
      support_email: `support@${config.username.split('@')[1] || 'koyosim.com'}`,
      unsubscribe_url: 'https://www.koyosim.com/account/notifications',
    };

    const subject = renderMarketingTemplate(template.defaultSubject, variables, 'welcome');
    const html = renderMarketingTemplate(template.defaultHtml, variables, 'welcome');
    const text = htmlToPlainText(html);

    const result = await sendGenericEmail({
      to: recipient,
      subject,
      html,
      text,
      purpose: 'marketing',
      userId,
      requireEnabled: true,
    });
    return { success: true, latencyMs: result.latencyMs };
  } catch (error) {
    console.error('[email/welcome] 欢迎邮件发送异常', { to: recipient, error: error?.message });
    return { success: false, error: error?.message || 'SEND_FAILED' };
  }
}

/**
 * 发送自定义营销邮件
 */
export async function sendMarketingEmail({
  to,
  templateKey = 'welcome',
  customSubject = null,
  customHtml = null,
  variables = {},
  userId = null,
  actorId = null,
}) {
  const recipient = String(to || '').trim();
  if (!recipient) throw Object.assign(new Error('请输入收件人邮箱'), { code: 'EMAIL_INVALID_RECIPIENT' });

  const template = MARKETING_TEMPLATES[templateKey] || MARKETING_TEMPLATES.welcome;
  const rawSubject = customSubject || template.defaultSubject;
  const rawHtml = customHtml || template.defaultHtml;

  const subject = renderMarketingTemplate(rawSubject, variables, templateKey);
  const html = renderMarketingTemplate(rawHtml, variables, templateKey);
  const text = htmlToPlainText(html);

  return sendGenericEmail({
    to: recipient,
    subject,
    html,
    text,
    purpose: 'marketing',
    userId,
    actorId,
    requireEnabled: true,
  });
}

/**
 * 管理后台营销测试发信（带限流、权限保护与审计）
 */
export async function sendMarketingTestEmail({
  actor,
  to,
  templateKey = 'welcome',
  customSubject = null,
  customHtml = null,
  variables = {},
  requestId = null,
}) {
  const recipient = String(to || '').trim();
  if (!recipient) return { error: '请输入有效的测试收件邮箱' };

  // 限制每位管理员 1 小时内最多发 10 次营销测试邮件
  const limit = await consumeRateLimit({
    scope: 'admin_marketing_email_test',
    subject: actor.id,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return { error: '营销邮件测试发送过于频繁，请稍后再试', status: 429 };
  }

  const template = MARKETING_TEMPLATES[templateKey] || MARKETING_TEMPLATES.welcome;
  const rawSubject = customSubject || template.defaultSubject;
  const rawHtml = customHtml || template.defaultHtml;

  const subject = `[测试] ${renderMarketingTemplate(rawSubject, variables, templateKey)}`;
  const html = renderMarketingTemplate(rawHtml, variables, templateKey);
  const text = htmlToPlainText(html);

  const startedAt = Date.now();
  const result = await sendGenericEmail({
    to: recipient,
    subject,
    html,
    text,
    purpose: 'marketing',
    actorId: actor.id,
    requireEnabled: true,
  });

  const latencyMs = result.latencyMs || Date.now() - startedAt;

  await providerRepo.recordProviderCall({
    provider: 'email_smtp',
    action: 'marketing_test_send',
    requestId,
    status: 'success',
    latencyMs,
    usage: { recipientDomain: recipient.split('@')[1], templateKey },
  });

  await logAudit({
    actor,
    action: 'email.marketing.test_send',
    targetType: 'email_template',
    targetId: templateKey,
    riskLevel: 'medium',
    after: { recipient, templateKey, subject, latencyMs },
    requestId,
  });

  return {
    success: true,
    message: `营销邮件测试已成功发出至 ${recipient}，请检查收件箱与垃圾箱`,
    latencyMs,
  };
}
