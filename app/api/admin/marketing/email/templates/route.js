import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { MARKETING_TEMPLATES } from '@/lib/emailMarketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const templates = Object.values(MARKETING_TEMPLATES).map((tmpl) => ({
    key: tmpl.key,
    name: tmpl.name,
    category: tmpl.category,
    description: tmpl.description,
    defaultSubject: tmpl.defaultSubject,
    defaultHtml: tmpl.defaultHtml,
    supportedVariables: tmpl.supportedVariables,
    sampleVariables: tmpl.sampleVariables,
  }));

  return okResponse({ templates }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
