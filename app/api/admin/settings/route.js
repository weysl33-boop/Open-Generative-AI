import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSystemSettingsList, saveSystemSetting } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.settingsRead);
  if (!guard.ok) return guard.response;

  const settings = getSystemSettingsList();
  return okResponse(settings, guard.requestId);
}

export async function POST(request) {
  const guard = requirePermission(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) return guard.response;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = saveSystemSetting({
    actor: guard.user,
    key: body.key,
    value: body.value,
    visibility: body.visibility || 'private',
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  return okResponse(result.setting, guard.requestId);
}
