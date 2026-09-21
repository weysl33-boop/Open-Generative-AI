import CallApiPage, { metadata as baseMetadata } from '@/app/call-api/page';

export const metadata = { ...baseMetadata, robots: { index: false, follow: false } };

export default function ZhCallApiPage() {
  return <CallApiPage />;
}
