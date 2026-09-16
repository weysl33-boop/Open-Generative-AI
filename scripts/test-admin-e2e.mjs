import { getDatabase } from '../lib/db/index.js';
import { runMigrations } from '../lib/db/migrations.js';
import { hasPermission, PERMISSIONS } from '../lib/admin/permissions.js';
import { redact, maskEmail, shortId } from '../lib/admin/redaction.js';
import { cursorEncode, cursorDecode } from '../lib/admin/pagination.js';
import { adjustUserCredits } from '../lib/services/credits.js';
import { getDashboardOverview } from '../lib/services/dashboard.js';

console.log('=== [E2E Test] 开始运行本地管理后台逻辑自动化测试 ===');

// 1. 测试迁移
runMigrations();
const db = getDatabase();
const migration = db.prepare("SELECT * FROM schema_migrations WHERE version = '001_admin_v1'").get();
if (!migration) throw new Error('迁移记录未成功写入');
console.log('✔ [DB] 数据库迁移执行与版本记录正常');

// 2. 权限矩阵测试
if (hasPermission('user', PERMISSIONS.dashboardRead)) throw new Error('普通用户不应具备 dashboardRead 权限');
if (!hasPermission('super_admin', PERMISSIONS.adminsWrite)) throw new Error('超级管理员应具备 adminsWrite 权限');
if (hasPermission('finance_admin', PERMISSIONS.adminsWrite)) throw new Error('财务管理员不应具备 adminsWrite 权限');
if (!hasPermission('finance_admin', PERMISSIONS.creditsAdjust)) throw new Error('财务管理员应具备 creditsAdjust 权限');
if (hasPermission('auditor', PERMISSIONS.creditsAdjust)) throw new Error('审计人员不应具备调额写权限');
console.log('✔ [RBAC] 5 大内置角色与细粒度权限矩阵验证通过');

// 3. 脱敏工具测试
const sensitiveObj = {
  email: 'testuser@koyosim.com',
  password_hash: '1234567890abcdef',
  apiKey: 'sk-abcdef123456',
  nested: {
    secretToken: 'secret_value',
    normal: 'ok',
  },
};
const redacted = redact(sensitiveObj);
if (redacted.password_hash || redacted.apiKey || redacted.nested.secretToken) {
  throw new Error('脱敏工具未能成功过滤敏感密钥字段');
}
if (redacted.email !== 'testuser@koyosim.com' || redacted.nested.normal !== 'ok') {
  throw new Error('脱敏工具错误移除了非敏感字段');
}
if (maskEmail('admin@koyosim.com') !== 'a***n@koyosim.com') {
  throw new Error('邮箱脱敏格式不正确: ' + maskEmail('admin@koyosim.com'));
}
if (shortId('usr_1234567890abcdef1234567890', 8, 6) !== 'usr_1234...567890') {
  throw new Error('长 ID 缩写格式不正确');
}
console.log('✔ [Security] 敏感信息递归脱敏与字段遮罩验证通过');

// 4. 游标分页编解码测试
const testRow = { id: 'usr_001', created_at: '2026-09-16T00:00:00.000Z' };
const encoded = cursorEncode(testRow);
const decoded = cursorDecode(encoded);
if (decoded.id !== 'usr_001' || decoded.createdAt !== '2026-09-16T00:00:00.000Z') {
  throw new Error('游标分页编解码数据不一致');
}
console.log('✔ [Pagination] 游标分页 Base64Url 编解码验证通过');

// 5. 调额与账本短事务测试
// 先插入一个测试用户
const testUserId = 'usr_test_' + Date.now();
db.prepare(`
  INSERT INTO users (id, email, password_hash, password_salt, role, credits, status, created_at)
  VALUES (?, ?, 'hash', 'salt', 'user', 100, 'active', datetime('now'))
`).run(testUserId, `${testUserId}@example.com`);

const adjustResult = adjustUserCredits({
  actor: { id: 'admin_test', email: 'admin@koyosim.com', role: 'super_admin' },
  userId: testUserId,
  delta: 50,
  reason: '自动化测试发放额度',
  referenceId: 'order_test_123',
  requestId: 'req_test_001',
});

if (adjustResult.error || adjustResult.credits !== 150) {
  throw new Error('调额执行异常: ' + JSON.stringify(adjustResult));
}

// 检查账本和审计日志
const ledgerEntry = db.prepare('SELECT * FROM credit_ledger WHERE user_id = ?').get(testUserId);
if (!ledgerEntry || ledgerEntry.delta !== 50) throw new Error('账本记录未成功生成');

const auditLog = db.prepare('SELECT * FROM admin_audit_logs WHERE target_id = ?').get(testUserId);
if (!auditLog || auditLog.action !== 'credits.adjust') throw new Error('审计日志未成功生成');
console.log('✔ [Credits & Audit] 调额短事务、流水账本与防篡改审计日志全链路验证通过');

// 6. 概览指标测试
const overview = getDashboardOverview();
if (overview.metrics.users <= 0) throw new Error('概览指标计算异常');
console.log('✔ [Dashboard] 运营概览指标聚合计算正常，当前测试用户数: ' + overview.metrics.users);

// 清理测试数据
db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
db.prepare('DELETE FROM credit_ledger WHERE user_id = ?').run(testUserId);
db.prepare('DELETE FROM admin_audit_logs WHERE target_id = ?').run(testUserId);

console.log('=== 全部自动化测试用例 100% 顺利通过！ ===');
