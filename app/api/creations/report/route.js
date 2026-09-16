import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/billing';
import { getDatabase } from '@/lib/db';
import { createModerationCase } from '@/lib/repositories/moderation';

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

    const db = getDatabase();
    const creation = db.prepare('SELECT id, status FROM creations WHERE id = ?').get(creationId);
    if (!creation) {
      return NextResponse.json({ error: '未找到指定作品记录' }, { status: 404 });
    }

    // 创建审核待办案件
    const modCase = createModerationCase({
      creationId,
      reasonCode,
    });

    // 将作品标记为审核中
    db.prepare(`
      UPDATE creations
      SET status = 'under_review'
      WHERE id = ?
    `).run(creationId);

    return NextResponse.json({
      success: true,
      message: '举报已受理，内容安全团队将尽快核查处理',
      caseId: modCase.id,
    });
  } catch (error) {
    console.error('[creations/report]', error);
    return NextResponse.json({ error: '提交举报失败，请稍后重试' }, { status: 500 });
  }
}
