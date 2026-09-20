import { withAdminErrorBoundary, requirePermission, json } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSubscriptionFaqConfig, saveSubscriptionFaqConfig, DEFAULT_SUBSCRIPTION_FAQ_CONFIG } from '@/lib/services/subscriptionFaq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansRead);
  if (!guard.ok) return guard.response;

  const config = await getSubscriptionFaqConfig();
  return json({ config, defaults: DEFAULT_SUBSCRIPTION_FAQ_CONFIG });
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const result = await saveSubscriptionFaqConfig({
    actor: guard.user,
    config: body.config || body,
    requestId: guard.requestId,
  });

  if (result.error) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({ success: true, config: result.config });
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
