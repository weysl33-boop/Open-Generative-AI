import crypto from 'node:crypto';
import { withTransaction } from '../lib/db/index.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

const email = String(process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
const bootstrapToken = String(process.env.ADMIN_BOOTSTRAP_TOKEN || '').trim();
const expectedTokenHash = String(process.env.ADMIN_BOOTSTRAP_TOKEN_HASH || '').trim().toLowerCase();

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('用法：ADMIN_BOOTSTRAP_TOKEN=<一次性随机令牌> node scripts/bootstrap-admin.mjs <已注册用户邮箱>');
  process.exitCode = 2;
} else if (bootstrapToken.length < 32 || !/^[a-f0-9]{64}$/.test(expectedTokenHash)) {
  console.error('[bootstrap-admin] 需要至少 32 字符的 ADMIN_BOOTSTRAP_TOKEN，以及对应的 ADMIN_BOOTSTRAP_TOKEN_HASH。');
  process.exitCode = 2;
} else {
  try {
    await assertSandboxDatabase();
    const actualTokenHash = crypto.createHash('sha256').update(bootstrapToken).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(actualTokenHash), Buffer.from(expectedTokenHash))) {
      throw new Error('ADMIN_BOOTSTRAP_TOKEN 校验失败。');
    }
    const result = await withTransaction(async (tx) => {
      const claim = await tx.queryOne('SELECT id, consumed_at FROM admin_bootstrap_claims WHERE id = $1 FOR UPDATE', ['initial_admin']);
      if (!claim) throw new Error('管理员 bootstrap 迁移尚未执行，请先运行 PostgreSQL migrations。');
      if (claim.consumed_at) throw new Error('管理员 bootstrap 令牌已经使用过，此操作不可重复执行。');

      const user = await tx.queryOne(
        'SELECT id, email, role, status FROM users WHERE LOWER(email) = $1 FOR UPDATE',
        [email]
      );
      if (!user) throw new Error(`未找到邮箱为 [${email}] 的已注册用户，请先完成普通用户注册。`);
      if (user.role !== 'user') throw new Error('目标用户已经是管理员或其他受保护角色，拒绝覆盖。');

      const now = new Date().toISOString();
      await tx.execute("UPDATE users SET role = 'super_admin', status = 'active', is_active = TRUE, is_banned = FALSE, updated_at = $1 WHERE id = $2", [now, user.id]);
      const revoked = await tx.execute('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await tx.execute(
        'UPDATE admin_bootstrap_claims SET consumed_at = $1, consumed_by = $2 WHERE id = $3',
        [now, user.id, 'initial_admin']
      );
      return { email: user.email, userId: user.id, revoked };
    });

    console.log(`[成功] 已将预先注册用户 [${result.email}] 提升为 super_admin，并作废 ${result.revoked} 个历史会话。bootstrap 令牌已消费。`);
  } catch (error) {
    console.error('[bootstrap-admin] failed:', error.message);
    process.exitCode = 1;
  }
}
