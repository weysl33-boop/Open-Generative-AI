import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { sendMarketingTestEmail } from '@/lib/emailMarketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', '营销测试邮件必须提供 Idempotency-Key', 422, guard.requestId);

  const idemp = await checkIdempotency({ scope: 'email_marketing_test_send', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '营销测试邮件正在发送中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '请求参数格式无效', 400, guard.requestId);
  }

  const { to, templateKey, subject, html, variables } = body || {};

  try {
    const result = await sendMarketingTestEmail({
      actor: guard.user,
      to,
      templateKey: templateKey || 'welcome',
      customSubject: subject,
      customHtml: html,
      variables: typeof variables === 'object' && variables !== null ? variables : {},
      requestId: guard.requestId,
    });

    if (result.error) {
      await releaseIdempotency(idemp.keyHash);
      return errorResponse(
        result.status === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR',
        result.error,
        result.status || 422,
        guard.requestId
      );
    }

    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    const code = String(error?.code || 'SMTP_ERROR');
    console.error('[admin/email-marketing-test]', { code, message: error?.message });
    const messages = {
      SMTP_NOT_CONFIGURED: '请先配置 QQ 企业邮箱账号与客户端密码',
      SMTP_AUTH_FAILED: 'SMTP 认证失败，请检查邮箱账号与密码',
      SMTP_TIMEOUT: 'SMTP 连接超时，请稍后重试',
      SMTP_UNAVAILABLE: 'SMTP 邮件服务暂时无法连接',
      EMAIL_INVALID_RECIPIENT: '请输入有效的收件邮箱地址',
    };
    return errorResponse(code, messages[code] || '测试邮件发送失败，请检查 SMTP 配置', 422, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
