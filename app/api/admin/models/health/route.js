import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
import { probeProviderChannels, probeFailureStatus } from '@/lib/services/healthProbe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const channels = await getChannelsHealthOverview();
  return okResponse({ channels }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const providerId = body.providerId || body.provider_id;
  const providerIds = Array.isArray(body.providerIds || body.provider_ids)
    ? (body.providerIds || body.provider_ids)
    : null;
  const all = body.all === true || body.scope === 'all';

  const scopes = [providerId && 'providerId', providerIds && 'providerIds', all && 'all'].filter(Boolean);
  if (scopes.length === 0) {
    return errorResponse('VALIDATION_ERROR', '请指定 providerId、providerIds 或 all:true', 422, guard.requestId);
  }
  if (scopes.length > 1) {
    return errorResponse('VALIDATION_ERROR', `一次只能指定一种探测范围，收到 ${scopes.join('、')}`, 422, guard.requestId);
  }

  const result = await probeProviderChannels({
    providerIds: providerIds ?? (providerId ? [providerId] : null),
    all,
  });
  if (!result.ok) {
    return errorResponse(result.code, result.message, probeFailureStatus(result.code), guard.requestId);
  }

  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
