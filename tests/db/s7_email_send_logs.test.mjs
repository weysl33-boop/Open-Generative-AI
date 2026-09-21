import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const sendLogRepo = await import('../../lib/repositories/emailSendLogs.js');

if (testUrl) await migrations.runMigrations();

const suffix = Date.now().toString(36);
const recipient = `s7-${suffix}@example.com`;

test.after(async () => {
  if (testUrl) {
    await db.execute('DELETE FROM auth_usr.email_send_logs WHERE recipient = $1', [recipient]).catch(() => {});
  }
  await db.closePgPool();
});

test('migration 029 creates the send-log table with the reserved marketing purpose', async () => {
  const column = await db.queryOne(`
    SELECT is_nullable AS nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'auth_usr' AND table_name = 'email_send_logs' AND column_name = 'purpose'
  `);
  assert.ok(column, 'auth_usr.email_send_logs.purpose 必须存在');
  assert.equal(column.nullable, 'NO');

  // 营销类型必须已经预留（邮件营销系统的明细复用同一张表），未知类型必须被挡住。
  const marketingId = await sendLogRepo.recordEmailSendLog({
    purpose: 'marketing',
    recipient,
    subject: '营销类型预留位',
    body: '尚未开放群发',
    status: 'success',
  });
  assert.ok(marketingId);
  await assert.rejects(
    db.execute(`
      INSERT INTO auth_usr.email_send_logs (id, purpose, recipient, recipient_domain, subject, status)
      VALUES ('s7_bad_purpose', 'spam', $1, 'example.com', 'x', 'success')
    `, [recipient]),
    /violates check constraint/i
  );
  await db.execute('DELETE FROM auth_usr.email_send_logs WHERE id = $1', [marketingId]);
});

test('verification codes never reach the detail table in plaintext', async () => {
  const id = await sendLogRepo.recordEmailSendLog({
    purpose: 'verification',
    recipient,
    subject: 'KoyoSIM 安全邮箱验证码',
    body: '您的 KoyoSIM 安全邮箱验证码为 418293，10 分钟内有效。',
    status: 'success',
    latencyMs: 812,
  });
  const row = await db.queryOne('SELECT body_preview, recipient_domain FROM auth_usr.email_send_logs WHERE id = $1', [id]);
  assert.ok(row, '发信记录必须落库');
  assert.equal(row.recipient_domain, 'example.com');
  assert.doesNotMatch(row.body_preview, /418293/);
  assert.match(row.body_preview, /\*\*\*\*\*\*/);
});

test('stats and detail filters read from the same rows the page renders', async () => {
  await sendLogRepo.recordEmailSendLog({
    purpose: 'test',
    recipient,
    subject: '[KoyoSIM] QQ 企业邮箱 SMTP 配置测试',
    body: '连通性测试',
    status: 'failed',
    errorCode: 'SMTP_AUTH_FAILED',
    latencyMs: 41,
  });

  const stats = await sendLogRepo.getEmailSendStats();
  assert.ok(stats.summary.all_total >= 2);
  assert.ok(stats.summary.all_failed >= 1);
  assert.ok(stats.byPurpose.some((item) => item.total >= 1));
  assert.ok(Array.isArray(stats.trend));
  assert.ok(stats.topDomains.some((item) => item.domain === 'example.com'));

  const onlyFailed = await sendLogRepo.listEmailSendLogs({
    searchParams: new URLSearchParams({ status: 'failed', q: 'SMTP 配置测试' }),
  });
  assert.ok(onlyFailed.rows.length >= 1);
  assert.ok(onlyFailed.rows.every((row) => row.status === 'failed' && row.recipient === recipient));

  const onlyVerification = await sendLogRepo.listEmailSendLogs({
    searchParams: new URLSearchParams({ purpose: 'verification', domain: '@example.com', days: 7 }),
  });
  assert.ok(onlyVerification.rows.every((row) => row.purpose === 'verification'));
  assert.ok(onlyVerification.rows.length >= 1);

  const paged = await sendLogRepo.listEmailSendLogs({
    searchParams: new URLSearchParams({ q: recipient, limit: '1' }),
  });
  assert.equal(paged.rows.length, 1);
  assert.equal(paged.meta.hasMore, true);
  const nextPage = await sendLogRepo.listEmailSendLogs({
    searchParams: new URLSearchParams({ q: recipient, limit: '1', cursor: paged.meta.nextCursor }),
  });
  assert.notEqual(nextPage.rows[0].id, paged.rows[0].id);
});
