import { NextResponse } from 'next/server';
import { getSubscriptionFaqConfig } from '@/lib/services/subscriptionFaq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getSubscriptionFaqConfig();
    const publicItems = (config.items || []).filter((item) => item.enabled !== false);

    return NextResponse.json(
      {
        notice: config.notice,
        supportEmail: config.supportEmail,
        invoiceNotice: config.invoiceNotice,
        items: publicItems,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
        },
      }
    );
  } catch (err) {
    console.error('[api/site/subscription-faq] error:', err);
    return NextResponse.json(
      { error: 'Failed to load subscription FAQ' },
      { status: 500 }
    );
  }
}
