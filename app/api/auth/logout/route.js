import { clearSessionCookie, deleteSession, json } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 4 * 1024 });
  if (guarded) return guarded;
  await deleteSession(request.cookies.get('ko_session')?.value);
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
}
