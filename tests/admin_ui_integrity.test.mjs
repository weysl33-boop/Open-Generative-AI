import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AdminUi 核心组件导出与完整性断言 (杜绝 Element type is invalid)', async () => {
  const adminUiCode = fs.readFileSync(path.join(repoRoot, 'components/admin/AdminUi.js'), 'utf8');

  // 必须正确 re-export Button 与 Badge
  assert.match(adminUiCode, /export\s*\{[^}]*Button[^}]*\}/, 'AdminUi 必须有效导出 Button');
  assert.match(adminUiCode, /export\s*\{[^}]*Badge[^}]*\}/, 'AdminUi 必须有效导出 Badge');
  assert.match(adminUiCode, /export\s+function\s+PageHeader/, 'AdminUi 必须导出 PageHeader');
  assert.match(adminUiCode, /export\s+function\s+Card/, 'AdminUi 必须导出 Card');
  assert.match(adminUiCode, /export\s+function\s+StatusBadge/, 'AdminUi 必须导出 StatusBadge');

  // 验证 button.jsx 包含默认与命名导出
  const buttonCode = fs.readFileSync(path.join(repoRoot, 'components/ui/button.jsx'), 'utf8');
  assert.match(buttonCode, /export\s*\{[^}]*Button[^}]*\}/, 'button.jsx 必须包含命名导出 Button');
  assert.match(buttonCode, /export\s+default\s+Button/, 'button.jsx 必须包含默认导出 Button');

  // 验证 badge.jsx 包含默认与命名导出
  const badgeCode = fs.readFileSync(path.join(repoRoot, 'components/ui/badge.jsx'), 'utf8');
  assert.match(badgeCode, /export\s*\{[^}]*Badge[^}]*\}/, 'badge.jsx 必须包含命名导出 Badge');
  assert.match(badgeCode, /export\s+default\s+Badge/, 'badge.jsx 必须包含默认导出 Badge');
});
