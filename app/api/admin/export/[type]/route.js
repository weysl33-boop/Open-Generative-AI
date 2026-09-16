import { requirePermission, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str}"`;
  }
  return str;
}

function toCsvString(headers, rows) {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((r) => headers.map((h) => escapeCsvField(r[h])).join(','));
  return `\uFEFF${headerLine}\n${rowLines.join('\n')}`;
}

export async function GET(request, context) {
  const guard = requirePermission(request, PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;

  const { type } = await context.params;
  const db = getDatabase();

  let filename = `export_${type}_${Date.now()}.csv`;
  let csvContent = '';

  if (type === 'users') {
    const rows = db.prepare(`
      SELECT id, email, display_name, role, status, credits, created_at, last_login_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    const headers = ['id', 'email', 'display_name', 'role', 'status', 'credits', 'created_at', 'last_login_at'];
    csvContent = toCsvString(headers, rows);
  } else if (type === 'orders') {
    const rows = db.prepare(`
      SELECT o.id, u.email, o.provider, o.plan_id, o.status, (o.amount_minor / 100.0) AS amount, o.currency, o.created_at, o.paid_at, o.refunded_at
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
    `).all();
    const headers = ['id', 'email', 'provider', 'plan_id', 'status', 'amount', 'currency', 'created_at', 'paid_at', 'refunded_at'];
    csvContent = toCsvString(headers, rows);
  } else if (type === 'creations') {
    const rows = db.prepare(`
      SELECT c.id, u.email, c.provider, c.model, c.studio_id, c.status, c.credit_cost, c.duration_ms, c.created_at, c.completed_at
      FROM creations c
      JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC
      LIMIT 10000
    `).all();
    const headers = ['id', 'email', 'provider', 'model', 'studio_id', 'status', 'credit_cost', 'duration_ms', 'created_at', 'completed_at'];
    csvContent = toCsvString(headers, rows);
  } else {
    return errorResponse('BAD_REQUEST', '不支持的导出数据类型', 400, guard.requestId);
  }

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
