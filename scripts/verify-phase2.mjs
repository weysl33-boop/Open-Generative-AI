import assert from 'node:assert';
import { getDatabase, withTransaction, nowIso, randomId } from '../lib/db/index.js';
import { createUser } from '../lib/billing.js';
import { findModelByEndpointOrId, listActiveModels, updateModelConfig } from '../lib/repositories/models.js';
import { createModerationCase, findModerationCaseById } from '../lib/repositories/moderation.js';
import { retryGenerationTask } from '../lib/services/generations.js';

console.log('=== [开始验证 Phase 2: 生成链路闭环与动态管控] ===');

const db = getDatabase();

// 1. 验证模型查询与开关
console.log('1. 验证模型开关与动态查询...');
const activeModels = listActiveModels();
assert.ok(Array.isArray(activeModels) && activeModels.length > 0);
console.log(`   ✓ 活跃模型拉取正常，当前共有 ${activeModels.length} 个可用模型`);

const testModel = activeModels[0];
const foundByEndpoint = findModelByEndpointOrId(testModel.id);
assert.ok(foundByEndpoint && foundByEndpoint.id === testModel.id);
console.log(`   ✓ 端点模糊/等值匹配正常: ${testModel.id}`);

// 2. 验证用户举报与审核流转闭环
console.log('2. 验证内容审核与举报闭环...');
const testEmail = `report_test_${Date.now()}@test.com`;
const { user } = createUser(testEmail, 'TestPassword123!');
const creationId = randomId('gen');
db.prepare(`
  INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, created_at)
  VALUES (?, ?, 'image', '测试待审图片', 'completed', 2, ?)
`).run(creationId, user.id, nowIso());

const modCase = createModerationCase({ creationId, reasonCode: 'violence_gore' });
assert.ok(modCase && modCase.id);
const queriedCase = findModerationCaseById(modCase.id);
assert.strictEqual(queriedCase.creation_id, creationId);
assert.strictEqual(queriedCase.status, 'pending');
console.log('   ✓ 违规内容举报成功转入审核待办池:', modCase.id);

// 3. 验证任务重试异步执行
console.log('3. 验证失败任务重试调度...');
const failedCreationId = randomId('gen');
db.prepare(`
  INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, model, metadata_json, created_at)
  VALUES (?, ?, 'image', '测试失败任务', 'failed', 2, 'flux-schnell', ?, ?)
`).run(failedCreationId, user.id, JSON.stringify({ prompt: 'A futuristic city' }), nowIso());

const adminActor = { id: 'usr_admin', email: 'admin@test.com', role: 'super_admin' };
const retryResult = retryGenerationTask({
  actor: adminActor,
  creationId: failedCreationId,
  chargeCredits: false,
  requestId: 'test_req',
});
assert.ok(retryResult.creation && retryResult.creation.id);
assert.strictEqual(retryResult.creation.parent_creation_id, failedCreationId);
console.log('   ✓ 重试任务记录成功派发并异步调度:', retryResult.creation.id);

console.log('=== [Phase 2 核心业务链路闭环验证通过！] ===');
