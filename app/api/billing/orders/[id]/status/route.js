import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { syncOrderPaymentStatus } from '@/lib/services/paymentService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: '缺少订单ID' }, { status: 400 });
  }

  const result = await syncOrderPaymentStatus(orderId, user.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }

  return NextResponse.json(result);
}
