import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/services/systemHealth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getSystemHealth();
  const healthy = Boolean(result.database.ok && result.migrations.ok);
  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    database: { ok: Boolean(result.database.ok) },
    migrations: { ok: Boolean(result.migrations.ok) },
    checkedAt: result.checkedAt,
  }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
