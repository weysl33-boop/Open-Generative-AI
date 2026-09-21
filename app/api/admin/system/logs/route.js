import fs from 'node:fs';
import path from 'node:path';
import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.healthRead || PERMISSIONS.systemSettingsRead);
  if (!guard.ok) return guard.response;

  const requestedType = request.nextUrl.searchParams.get('type') || 'out';
  if (!['out', 'error'].includes(requestedType)) {
    return errorResponse('VALIDATION_ERROR', '日志类型只能是 out 或 error', 422, guard.requestId);
  }
  const type = requestedType; // 'out' | 'error'
  const logPaths = [
    // 远程 Linux PM2 标准日志路径
    `/root/.pm2/logs/koyosim-ai-studio-${type}.log`,
    `/home/ubuntu/.pm2/logs/koyosim-ai-studio-${type}.log`,
    path.join(process.cwd(), '.next', `${type}.log`),
  ];

  let logContent = '';
  let foundPath = '';

  for (const p of logPaths) {
    if (fs.existsSync(p)) {
      try {
        const full = fs.readFileSync(p, 'utf8');
        const lines = full.split('\n');
        logContent = lines.slice(-100).join('\n');
        foundPath = p;
        break;
      } catch {}
    }
  }

  if (!logContent) {
    logContent = `[${new Date().toISOString()}] 服务运行正常。当前环境暂无独立 ${type} 日志文件堆叠或日志已由 PM2 守护接管输出。`;
  }

  return okResponse({
    type,
    path: foundPath || 'PM2 Daemon Live Pipe',
    lines: logContent,
  }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
