import { requirePermission, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return /[,\n"]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}
function toCsvString(headers, rows) {
  return `\uFEFF${headers.map(escapeCsvField).join(',')}\n${rows.map((row) => headers.map((header) => escapeCsvField(row[header])).join(',')).join('\n')}`;
}

export async function GET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;
  const { type } = await context.params;
  let headers; let rows;
  if (type === 'users') {
    headers = ['id', 'email', 'display_name', 'role', 'status', 'credits', 'created_at', 'last_login_at'];
    rows = await queryMany('SELECT id, email, display_name, role, status, credits, created_at, last_login_at FROM users ORDER BY created_at DESC');
  } else if (type === 'orders') {
    headers = ['id', 'email', 'provider', 'plan_id', 'status', 'amount', 'currency', 'created_at', 'paid_at', 'refunded_at'];
    rows = await queryMany('SELECT o.id, u.email, o.provider, o.plan_id, o.status, (o.amount_minor / 100.0) AS amount, o.currency, o.created_at, o.paid_at, o.refunded_at FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC');
  } else if (type === 'creations') {
    headers = ['id', 'email', 'provider', 'model', 'studio_id', 'status', 'credit_cost', 'duration_ms', 'created_at', 'completed_at'];
    rows = await queryMany('SELECT c.id, u.email, c.provider, c.model, c.studio_id, c.status, c.credit_cost, c.duration_ms, c.created_at, c.completed_at FROM creations c JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT 10000');
  } else {
    return errorResponse('BAD_REQUEST', '不支持的导出数据类型', 400, guard.requestId);
  }
  return new Response(toCsvString(headers, rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="export_${type}_${Date.now()}.csv"` } });
}
