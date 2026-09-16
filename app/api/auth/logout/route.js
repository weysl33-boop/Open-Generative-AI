import { clearSessionCookie, deleteSession, json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request) {
  await deleteSession(request.cookies.get('ko_session')?.value);
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
}
