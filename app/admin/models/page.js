import { getModelCenterSnapshot } from '@/lib/services/models';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import ModelControlCenter from './ModelControlCenter';

export const dynamic = 'force-dynamic';

const VIEW_PARAM_KEYS = ['q', 'status', 'type', 'provider', 'channel', 'route', 'sort', 'view'];

function readViewParams(searchParams) {
  const params = {};
  for (const key of VIEW_PARAM_KEYS) {
    const value = searchParams?.[key];
    if (typeof value === 'string') params[key] = value;
    else if (Array.isArray(value)) params[key] = value.filter((item) => typeof item === 'string').join(',');
  }
  return params;
}

export default async function ModelsPage({ searchParams }) {
  const user = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const [snapshot, params] = await Promise.all([getModelCenterSnapshot(), searchParams]);

  return (
    <ModelControlCenter
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
      initialParams={readViewParams(params)}
      canWrite={hasPermission(user.role, PERMISSIONS.modelsWrite)}
    />
  );
}
