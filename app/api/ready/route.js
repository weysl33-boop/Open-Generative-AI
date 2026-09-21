import { NextResponse } from 'next/server';
import { getReadiness } from '@/lib/services/systemHealth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getReadiness();
  return NextResponse.json({
    status: result.ready ? 'ready' : 'not_ready',
    database: result.database,
    migrations: result.migrations,
    checkedAt: new Date().toISOString(),
  }, { status: result.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
