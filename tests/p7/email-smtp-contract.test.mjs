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
  const client = source('app/admin/providers/email/EmailSmtpConfigClient.js');
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
  assert.match(sender, /createEmailTransport\(\{ requireEnabled: true \}\)/);
  assert.match(profile, /emailVerificationCode/);
  assert.match(profile, /verificationRequired/);
});

test('email admin write, secret, health and real-send endpoints require provider permissions and idempotency', () => {
  const files = [
    'app/api/admin/providers/email/route.js',
    'app/api/admin/providers/email/secrets/route.js',
    'app/api/admin/providers/email/health/route.js',
    'app/api/admin/providers/email/test/route.js',
  ];
  for (const file of files) {
    const route = source(file);
    assert.match(route, /requirePermission/);
    assert.match(route, /getRequiredIdempotencyKey/);
    assert.match(route, /withAdminErrorBoundary/);
  }
  assert.match(source(files[1]), /verifyAdminPassword|saveEmailSmtpPassword/);
  assert.match(source(files[3]), /sendEmailSmtpTest/);
  assert.doesNotMatch(source(files[3]), /error\.message\s*,\s*500/);
});

test('login configuration navigation exposes social, SMS and email pages as a card switcher', () => {
  const navigationPath = fs.existsSync(path.join(root, 'lib/admin/navigation.js'))
    ? 'lib/admin/navigation.js'
    : 'components/admin/AdminNav.js';
  const navigation = source(navigationPath);
  const cardNav = source('components/admin/LoginConfigurationNav.js');
  const emailPage = source('app/admin/providers/email/page.js');
  assert.match(navigation, /label:\s*'登录配置'/);
  assert.match(navigation, /href:\s*'\/admin\/providers\/social'.*社交登录/);
  assert.match(navigation, /href:\s*'\/admin\/providers\/sms'.*短信登录/);
  assert.match(navigation, /href:\s*'\/admin\/providers\/email'.*邮箱登录/);
  assert.match(cardNav, /社交登录/);
  assert.match(cardNav, /短信登录/);
  assert.match(cardNav, /邮箱登录/);
  assert.match(emailPage, /LoginConfigurationNav active="email"/);
});
