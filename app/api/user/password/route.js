import crypto from 'node:crypto';
import { getUserFromRequest, json, passwordHash } from '@/lib/services/auth';
import { withTransaction } from '@/lib/db';
import { findUserPasswordCredential, setUserPassword } from '@/lib/repositories/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!newPassword || newPassword.length < 8) {
      return json({ error: '新密码长度至少需要 8 位' }, { status: 400 });
    }

    // 1. 按登录同款解析规则取现有凭据
    const credential = await findUserPasswordCredential(user.id);

    // 若用户已设置过密码，则必须校对旧密码
    if (credential) {
      if (!oldPassword) {
        return json({ error: '请输入当前密码以验证身份' }, { status: 400 });
      }
      const { hash } = passwordHash(oldPassword, credential.password_salt);
      const actual = Buffer.from(hash, 'hex');
      const expected = Buffer.from(credential.password_hash, 'hex');
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        return json({ error: '当前密码输入错误' }, { status: 400 });
      }
    }

    // 2. 生成新密码并同步写入主表与邮箱账号
    const { salt: newSalt, hash: newHash } = passwordHash(newPassword);
    await withTransaction((tx) => setUserPassword({ userId: user.id, passwordHash: newHash, passwordSalt: newSalt }, tx));

    return json({ success: true, message: '密码已成功更新' });
  } catch (error) {
    console.error('[password change error]', error);
    return json({ error: '修改密码处理失败，请稍后重试' }, { status: 500 });
  }
}
