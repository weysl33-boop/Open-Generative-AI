import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/billing';
import { reportCreation } from '@/lib/services/moderation';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: '请先登录后再提交举报' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const creationId = String(body.creationId || '').trim();
    const reasonCode = String(body.reason || 'user_reported').slice(0, 50);

    if (!creationId) {
      return NextResponse.json({ error: '缺少作品标识' }, { status: 400 });
    }

    const result = await reportCreation({ userId: user.id, creationId, reasonCode });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: '举报已受理，内容安全团队将尽快核查处理',
      caseId: result.caseId,
    });
  } catch (error) {
    console.error('[creations/report]', error);
    return NextResponse.json({ error: '提交举报失败，请稍后重试' }, { status: 500 });
  }
}
