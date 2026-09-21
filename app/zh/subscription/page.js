import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ZhSubscriptionPage({ searchParams }) {
  const params = await searchParams;
  const action = params?.action ? `?action=${encodeURIComponent(params.action)}` : '';
  redirect(`/zh/pricing${action}`);
}
