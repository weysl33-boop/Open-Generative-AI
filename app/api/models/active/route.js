import { NextResponse } from 'next/server';
import { listActiveModels } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const models = await listActiveModels();
    return NextResponse.json({
      success: true,
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        provider: m.provider,
        creditsPrice: m.credits_price,
        sortOrder: m.sort_order,
      })),
    });
  } catch (error) {
    console.error('[api/models/active]', error);
    return NextResponse.json({ error: '获取模型列表失败' }, { status: 500 });
  }
}
