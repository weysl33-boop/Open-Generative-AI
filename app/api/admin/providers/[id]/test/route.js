import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { testProviderHealth } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const result = await testProviderHealth({
    actor: guard.user,
    provider: id,
    requestId: guard.requestId,
  });

  return okResponse(result, guard.requestId);
}
