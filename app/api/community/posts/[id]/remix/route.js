import { json } from '@/lib/billing';
import { recordRemixCount } from '@/lib/repositories/community';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await recordRemixCount(id);
    return json({ ok: true });
  } catch (error) {
    return json({ error: '记录做同款失败' }, { status: 500 });
  }
}
