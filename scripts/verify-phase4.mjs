import assert from 'node:assert';
import { getDatabase } from '../lib/db/index.js';
import { createUser } from '../lib/billing.js';
import { createCouponsBatch, redeemCoupon, listCoupons } from '../lib/services/coupons.js';

console.log('=== [开始验证 Phase 4: 商业化营销工具与数据导出] ===');

const db = getDatabase();

// 1. 验证卡密生成
console.log('1. 验证卡密批量生成...');
const adminActor = { id: 'usr_admin', email: 'admin@test.com', role: 'operations_admin' };
const batchRes = createCouponsBatch({
  count: 3,
  type: 'credits',
  value: '88',
  maxUses: 1,
  actor: adminActor,
  requestId: 'req_batch_test',
});
assert.strictEqual(batchRes.success, true);
assert.strictEqual(batchRes.count, 3);
assert.strictEqual(batchRes.codes.length, 3);
console.log('   ✓ 成功批量生成卡密:', batchRes.codes);

// 2. 验证用户兑换
console.log('2. 验证用户安全兑换与重复防刷...');
const testEmail = `coupon_user_${Date.now()}@test.com`;
const { user } = createUser(testEmail, 'TestPassword123!');
const initialCredits = user.credits;
const targetCode = batchRes.codes[0];

const redeemSuccess = redeemCoupon({ code: targetCode, user });
assert.strictEqual(redeemSuccess.success, true);
console.log('   ✓ 兑换成功响应:', redeemSuccess.message);

// 验证用户当前额度是否真正增加
const updatedUser = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
assert.strictEqual(updatedUser.credits, initialCredits + 88);

// 验证重复兑换拦截
const secondRedeem = redeemCoupon({ code: targetCode, user });
assert.strictEqual(secondRedeem.error, '您已兑换过此兑换码，无法重复使用');
console.log('   ✓ 重复兑换被成功拦截:', secondRedeem.error);

// 验证另一个用户尝试使用已被完全核销的单次卡密
const anotherUser = { id: 'usr_another_test', email: 'another@test.com' };
const thirdRedeem = redeemCoupon({ code: targetCode, user: anotherUser });
assert.strictEqual(thirdRedeem.error, '该兑换码已被完全兑换，无法再次使用');
console.log('   ✓ 达到最大使用次数后拦截正常:', thirdRedeem.error);

// 3. 验证卡密列表分页检索
console.log('3. 验证卡密列表分页检索...');
const couponList = listCoupons(new URLSearchParams({ q: targetCode }));
assert.ok(couponList.rows.length >= 1);
assert.strictEqual(couponList.rows[0].code, targetCode);
console.log('   ✓ 卡密检索正常，使用进度统计:', `${couponList.rows[0].used_count}/${couponList.rows[0].max_uses}`);

console.log('=== [Phase 4 商业化营销工具验证通过！] ===');
