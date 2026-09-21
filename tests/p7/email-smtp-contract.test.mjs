import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('QQ Exmail uses the fixed official TLS endpoint and keeps credentials server-side', () => {
  const config = source('lib/emailConfig.js');
  const service = source('lib/emailService.js');
  const client = source('app/admin/email/EmailSettingsClient.js');
  assert.match(config, /smtp\.exmail\.qq\.com/);
  assert.match(config, /port:\s*465/);
  assert.match(config, /getProviderSecret\(EMAIL_SMTP_PROVIDER, 'smtp_password'\)/);
  assert.match(service, /nodemailer\.createTransport/);
  assert.match(service, /await transport\.verify\(\)/);
  assert.match(service, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(client, /EMAIL_SMTP_PASSWORD|smtp_password|secretValue/);
  assert.match(client, /type="password"/);
});

test('email binding is verified before the address is attached to an account', () => {
  const route = source('app/api/user/email/route.js');
  const service = source('lib/services/emailVerification.js');
  const repository = source('lib/repositories/emailVerification.js');
  const sender = source('lib/emailService.js');
  const profile = source('components/account/tabs/ProfileTab.js');

  assert.match(route, /requestEmailBinding/);
  assert.match(route, /confirmEmailBinding/);
  assert.doesNotMatch(route, /email_verified_at\s*=\s*NOW\(\)/i);
  assert.match(service, /AUTH_VERIFICATION_CODE_SECRET/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /CODE_TTL_MS/);
  assert.match(repository, /attempts\s*=\s*attempts\s*\+\s*1/);
  assert.match(repository, /used_at\s*=\s*NOW\(\)/);
  assert.match(sender, /requireEnabled: true/);
  assert.match(sender, /purpose: 'verification'/);
  assert.match(profile, /emailVerificationCode/);
  assert.match(profile, /verificationRequired/);
});

test('email admin write, health and real-send endpoints require provider permissions and idempotency', () => {
  const files = [
    'app/api/admin/providers/email/route.js',
    'app/api/admin/providers/email/health/route.js',
    'app/api/admin/providers/email/test/route.js',
  ];
  for (const file of files) {
    const route = source(file);
    assert.match(route, /requirePermission/);
    assert.match(route, /getRequiredIdempotencyKey/);
    assert.match(route, /withAdminErrorBoundary/);
  }
  // 改密必须重新验证管理员身份，且与配置同一请求提交（不再有独立的密钥端点）。
  assert.match(source('lib/emailAdmin.js'), /verifyAdminPassword\(actor\.id, body\.adminPassword\)/);
  assert.ok(!fs.existsSync(path.join(root, 'app/api/admin/providers/email/secrets/route.js')));
  assert.match(source(files[2]), /sendEmailSmtpTest/);
  assert.doesNotMatch(source(files[2]), /error\.message\s*,\s*500/);
});

test('SMTP settings live on one page that also shows send statistics and per-message detail', () => {
  const navigation = source('lib/admin/navigation.js');
  const page = source('app/admin/email/page.js');
  const form = source('app/admin/email/EmailSettingsClient.js');

  assert.match(navigation, /href:\s*'\/admin\/email',\s*label:\s*'邮件发信设置'/);
  assert.match(navigation, /'\/admin\/providers\/email':\s*'\/admin\/email'/);
  // 邮箱 SMTP 不再挂在登录配置分组下，也不再有独立子页。
  assert.doesNotMatch(navigation, /href:\s*'\/admin\/providers\/email',\s*label:/);
  assert.doesNotMatch(navigation, /label:\s*'邮箱登录'/);

  // 一个页面、一个表单：配置 + 密码 + 检查 + 测试发信全在这里。
  assert.match(form, /保存发信设置/);
  assert.match(form, /检查连接/);
  assert.match(form, /发送真实测试邮件/);
  assert.match(page, /<EmailSettingsClient/);
  assert.match(page, /getEmailSmtpOverview\(\)/);
  assert.match(page, /<MetricCard/);
  assert.match(page, /发信统计/);
  assert.match(page, /发信内容明细/);
  assert.match(page, /getEmailSendStats/);
  assert.match(page, /listEmailSendLogs/);
  assert.match(page, /<DataTable/);
  assert.match(page, /<Pagination/);
  // 邮件营销是待定计划，只能以预留形态出现，不能已经开放群发。
  assert.match(page, /邮件营销系统/);
  assert.match(page, /待定计划/);
});

test('every SMTP delivery is logged with secrets redacted', () => {
  const service = source('lib/emailService.js');
  const repository = source('lib/repositories/emailSendLogs.js');
  const migration = source('lib/db/migrations/029_email_send_logs.sql');

  assert.match(service, /await logSend\(\{ purpose, recipient, subject, body: text, status: 'success'/);
  assert.match(service, /status: 'failed'/);
  assert.match(repository, /redactSecrets/);
  assert.match(repository, /验证码\[为/);
  assert.match(migration, /auth_usr\.email_send_logs/);
  assert.match(migration, /purpose[\s\S]*'verification', 'test', 'system', 'marketing'/);
  assert.doesNotMatch(migration, /code_hash|password/i);
});
