import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('marketing email templates have complete metadata, variables, and responsive HTML', async () => {
  const { MARKETING_TEMPLATES, renderMarketingTemplate, htmlToPlainText } = await import('../../lib/emailMarketing.js');
  
  const expectedKeys = ['welcome', 'newsletter', 'credit_alert', 'winback'];
  assert.deepEqual(Object.keys(MARKETING_TEMPLATES).sort(), expectedKeys.sort());

  for (const key of expectedKeys) {
    const tmpl = MARKETING_TEMPLATES[key];
    assert.equal(tmpl.key, key);
    assert.ok(tmpl.name, `${key} 必须有 name`);
    assert.ok(tmpl.category, `${key} 必须有 category`);
    assert.ok(tmpl.description, `${key} 必须有 description`);
    assert.ok(tmpl.defaultSubject, `${key} 必须有 defaultSubject`);
    assert.ok(tmpl.defaultHtml, `${key} 必须有 defaultHtml`);
    assert.ok(Array.isArray(tmpl.supportedVariables) && tmpl.supportedVariables.length > 0, `${key} 必须定义变量`);
    assert.ok(tmpl.sampleVariables, `${key} 必须提供示例变量`);

    // HTML 结构合规
    assert.match(tmpl.defaultHtml, /<!DOCTYPE html>/i);
    assert.match(tmpl.defaultHtml, /<html/i);
    assert.match(tmpl.defaultHtml, /email-container/);
    assert.match(tmpl.defaultHtml, /\{\{unsubscribe_url\}\}/);

    // 变量插值渲染测试
    const rendered = renderMarketingTemplate(tmpl.defaultHtml, tmpl.sampleVariables, key);
    assert.doesNotMatch(rendered, /\{\{\s*[a-zA-Z0-9_-]+\s*\}\}/, `${key} 渲染后不应残留任何未替换的占位符`);
    assert.match(rendered, new RegExp(tmpl.sampleVariables.name));

    // 纯文本 fallback 测试
    const plain = htmlToPlainText(rendered);
    assert.ok(plain.length > 50, '纯文本 fallback 应提取有效文字');
    assert.doesNotMatch(plain, /<style[^>]*>/i, '纯文本中不应含样式块');
    assert.doesNotMatch(plain, /<div[^>]*>/i, '纯文本中不应含 HTML 标签');
  }
});

test('deliverEmail supports html parameter and provides fallback plain text', () => {
  const serviceCode = source('lib/emailService.js');
  assert.match(serviceCode, /async function deliverEmail\(\{\s*to,\s*subject,\s*text,\s*html/);
  assert.match(serviceCode, /if\s*\(html\)\s*mailOptions\.html\s*=\s*html/);
  assert.match(serviceCode, /export async function sendGenericEmail/);
});

test('createUser in auth.js has decoupled asynchronous welcome email hook', () => {
  const authCode = source('lib/services/auth.js');
  assert.match(authCode, /sendWelcomeEmail/);
  assert.match(authCode, /queueMicrotask\(/);
  assert.match(authCode, /import\('\.\.\/emailMarketing\.js'\)/);
  assert.match(authCode, /\[auth\/welcome-email-hook-failed\]/);
});

test('admin marketing email API routes implement authorization, idempotency, and error handling', () => {
  const templateRoute = source('app/api/admin/marketing/email/templates/route.js');
  assert.match(templateRoute, /requirePermission/);
  assert.match(templateRoute, /PERMISSIONS\.providersRead/);
  assert.match(templateRoute, /withAdminErrorBoundary/);
  assert.match(templateRoute, /MARKETING_TEMPLATES/);

  const testRoute = source('app/api/admin/marketing/email/test/route.js');
  assert.match(testRoute, /requirePermission/);
  assert.match(testRoute, /PERMISSIONS\.providersWrite/);
  assert.match(testRoute, /getRequiredIdempotencyKey/);
  assert.match(testRoute, /checkIdempotency/);
  assert.match(testRoute, /sendMarketingTestEmail/);
  assert.match(testRoute, /withAdminErrorBoundary/);
});

test('admin system email page integrates MarketingEmailSection client component', () => {
  const pageCode = source('app/admin/system/email/page.js');
  assert.match(pageCode, /import MarketingEmailSection from '\.\/MarketingEmailSection'/);
  assert.match(pageCode, /<MarketingEmailSection/);
  assert.match(pageCode, /canWrite=\{hasPermission\(user\.role,\s*PERMISSIONS\.providersWrite\)\}/);

  const componentCode = source('app/admin/system/email/MarketingEmailSection.js');
  assert.match(componentCode, /'use client'/);
  assert.match(componentCode, /MARKETING_TEMPLATES/);
  assert.match(componentCode, /renderMarketingTemplate/);
  assert.match(componentCode, /iframe/);
  assert.match(componentCode, /\/api\/admin\/marketing\/email\/test/);
});
