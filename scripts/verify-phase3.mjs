import assert from 'node:assert';
import { getDatabase, nowIso, randomId } from '../lib/db/index.js';
import { createUser, recordWebhookEvent } from '../lib/billing.js';
import { dispatchStripeEvent } from '../lib/services/webhookDispatcher.js';
import { processOrderRefund } from '../lib/services/billing.js';

console.log('=== [开始验证 Phase 3: 财务退款与 Webhook 闭环] ===');

const db = getDatabase();

// 1. 验证 Webhook 原始报文持久化与派发
console.log('1. 验证 Webhook 报文持久化与事件派发...');
const testEmail = `stripe_test_${Date.now()}@test.com`;
const { user } = createUser(testEmail, 'TestPassword123!');
const eventId = `evt_test_${Date.now()}`;
const orderId = randomId('ord');

// 预建一条 pending 订单
db.prepare(`
  INSERT INTO orders (id, user_id, provider, plan_id, status, amount_minor, currency, created_at, updated_at)
  VALUES (?, ?, 'stripe', 'pro', 'pending', 500, 'USD', ?, ?)
`).run(orderId, user.id, nowIso(), nowIso());

const mockPayload = {
  id: eventId,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_mock_123',
      customer: 'cus_test_123',
      subscription: 'sub_test_123',
      metadata: {
        user_id: user.id,
        plan_id: 'pro',
        order_id: orderId,
      },
    },
  },
};

const recorded = recordWebhookEvent('stripe', eventId, mockPayload);
assert.strictEqual(recorded, true);

const eventRow = db.prepare('SELECT * FROM webhook_events WHERE event_id = ?').get(eventId);
assert.ok(eventRow && eventRow.payload_json);
assert.strictEqual(JSON.parse(eventRow.payload_json).type, 'checkout.session.completed');
console.log('   ✓ Webhook 完整载荷已成功持久化至数据库');

// 测试真实派发处理
const dispatchRes = dispatchStripeEvent(mockPayload);
assert.strictEqual(dispatchRes.success, true);

// 验证订单是否变为 paid
const updatedOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
assert.strictEqual(updatedOrder.status, 'paid');

// 验证订阅是否已成功写入
const subRow = db.prepare('SELECT status, plan_id FROM subscriptions WHERE user_id = ?').get(user.id);
assert.ok(subRow && subRow.status === 'active' && subRow.plan_id === 'pro');
console.log('   ✓ Webhook 事件自动完成订单结转与订阅开通闭环');

// 2. 验证订单退款与订阅权限自动收回
console.log('2. 验证订单退款与订阅权限收回...');
const adminActor = { id: 'usr_admin', email: 'admin@test.com', role: 'finance_admin' };
const refundRes = await processOrderRefund({
  actor: adminActor,
  orderId,
  reason: '用户申请全额退款测试',
  requestId: 'req_refund_test',
});
assert.strictEqual(refundRes.order.status, 'refunded');

// 验证用户关联的有效订阅是否被安全取消（防坏账）
const canceledSub = db.prepare('SELECT status FROM subscriptions WHERE user_id = ?').get(user.id);
assert.strictEqual(canceledSub.status, 'canceled');
console.log('   ✓ 订单已标记为退款，关联订阅已被自动安全撤回');

console.log('=== [Phase 3 财务与 Webhook 闭环验证通过！] ===');
