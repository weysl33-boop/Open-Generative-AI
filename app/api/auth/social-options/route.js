import { NextResponse } from 'next/server';
import { getSocialLoginProviders } from '@/lib/auth/socialProviders';
import { getSocialLoginRegion } from '@/lib/auth/socialRegion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const region = getSocialLoginRegion(request.headers);
  return NextResponse.json(
    { region, providers: getSocialLoginProviders(region) },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'x-real-ip, cf-connecting-ip, x-forwarded-for',
      },
    },
  );
}
