import assert from 'node:assert';
import { getDatabase, withTransaction, nowIso, randomId } from '../lib/db/index.js';
import { authenticateUser, createSession, getUserBySession, createUser } from '../lib/billing.js';
import { getSettingByKey, updateSettingValue } from '../lib/repositories/settings.js';

console.log('=== [开始验证 Phase 1: 核心安全加固与配置联动] ===');

const db = getDatabase();

// 1. 验证数据库单例正常工作
console.log('1. 测试统一数据库单例与事务...');
withTransaction((d) => {
  const row = d.prepare('SELECT 1 AS ok').get();
  assert.strictEqual(row.ok, 1);
});
console.log('   ✓ 统一数据库单例与事务执行正常');

// 2. 测试注册与封禁登录拦截
console.log('2. 测试用户封禁拦截逻辑...');
const testEmail = `test_suspend_${Date.now()}@test.com`;
const testPwd = 'TestPassword123!';
const { user: newUser } = createUser(testEmail, testPwd);
assert.ok(newUser && newUser.id);

// 正常登录
const authSuccess = authenticateUser(testEmail, testPwd);
assert.strictEqual(authSuccess.email, testEmail);
assert.strictEqual(authSuccess.status, 'active');

// 创建正常会话
const session = createSession(newUser.id);
const sessionUser = getUserBySession(session.token);
assert.strictEqual(sessionUser.id, newUser.id);
assert.strictEqual(sessionUser.status, 'active');

// 将该用户封禁
db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(newUser.id);

// 测试封禁后登录拦截
const authSuspended = authenticateUser(testEmail, testPwd);
assert.ok(authSuspended.error === 'ACCOUNT_SUSPENDED', '封禁用户登录必须返回 ACCOUNT_SUSPENDED');
console.log('   ✓ 封禁用户密码登录被成功拦截：', authSuspended.message);

// 测试已持有的 session 是否被自动阻断并吊销
const sessionSuspended = getUserBySession(session.token);
assert.strictEqual(sessionSuspended, null, '封禁用户的 Session 读取必须返回 null');
console.log('   ✓ 封禁用户的活跃会话被自动销毁拦截');

// 3. 测试系统设置读取
console.log('3. 测试系统设置读写与开关...');
const regSetting = getSettingByKey('registration_enabled');
assert.ok(regSetting && typeof regSetting.value === 'object');
console.log('   ✓ registration_enabled 当前状态:', regSetting.value);

const maintSetting = getSettingByKey('maintenance_mode');
assert.ok(maintSetting && typeof maintSetting.value === 'object');
console.log('   ✓ maintenance_mode 当前状态:', maintSetting.value);

console.log('=== [Phase 1 全部安全项验证通过！] ===');
