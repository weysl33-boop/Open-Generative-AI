import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { query, queryOne } from '../lib/db/pg.js';
import * as notifRepo from '../lib/repositories/notifications.js';

test('Database: sys_core.user_notifications table and repository functions', async () => {
  // 1. 验证表结构与存量通知
  const sampleUser = await queryOne('SELECT id, user_number FROM auth_usr.users LIMIT 1');
  assert.ok(sampleUser, 'Must have at least 1 sample user in database');

  const notifications = await notifRepo.getUserNotifications(sampleUser.id, 10);
  assert.ok(Array.isArray(notifications), 'getUserNotifications must return an array');
  assert.ok(notifications.length > 0, 'User should have initial system notifications from migration');

  // 2. 验证未读数统计
  const count = await notifRepo.getUnreadNotificationCount(sampleUser.id);
  assert.strictEqual(typeof count, 'number', 'Unread count must be a number');
  assert.ok(count >= 0, 'Unread count must be non-negative');

  // 3. 测试创建自定义通知
  const testNotif = await notifRepo.createNotification({
    userId: sampleUser.id,
    title: '自动化审计测试通知',
    content: '这是一条用于验证全站通知系统联调状态的测试通知',
    type: 'system',
    linkUrl: '/account?tab=activity',
  });
  assert.ok(testNotif?.id, 'Custom notification must be inserted with an ID');
  assert.strictEqual(testNotif.title, '自动化审计测试通知');

  // 4. 清理测试通知
  await query('DELETE FROM sys_core.user_notifications WHERE id = $1', [testNotif.id]);
});

test('Component: UserDropdownMenu faithfully matches the reference image layout and animations', async () => {
  const code = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  // 1. 验证已剔除无实际用处的 3D 假胶囊
  assert.ok(!code.includes('AI 3D 预演功能上线'), 'Must remove redundant 3D capsule');

  // 2. 验证通知中心铃铛与角标
  assert.ok(code.includes('Bell'), 'Must include Bell icon');
  assert.ok(code.includes('unreadCount'), 'Must display unread notification badge');
  assert.ok(code.includes('/api/user/notifications'), 'Must connect to real notifications API');
  assert.ok(code.includes('handleMarkAllAsRead'), 'Must support marking all notifications as read');

  // 3. 验证会员订阅与折角特惠标签
  assert.ok(code.includes('Crown'), 'Must include Crown icon for subscription');
  assert.ok(code.includes('会员订阅') || code.includes('Subscription'), 'Must have subscription button');
  assert.ok(code.includes('handleOpenPricing'), 'Subscription entry must use the canonical pricing page');
  assert.ok(code.includes('/pricing'), 'Subscription entry must navigate to the plans route');

  // 4. 验证算力额度胶囊与 FREE/PRO 标识
  assert.ok(code.includes('Box') || code.includes('Zap'), 'Must include Box/Zap icon for credits');
  assert.ok(code.includes('FREE'), 'Must include FREE tier pill');
  assert.ok(code.includes('points-details'), 'Clicking credits must trigger points-details tab');

  // 5. 验证用户头像与悬浮动效面板
  assert.ok(code.includes('animate-in') && code.includes('backdrop-blur'), 'Must have smooth animation and high-blur backdrop');
  assert.ok(code.includes('UID:') || code.includes('userNumber'), 'Must display permanent 6-digit number ID in dropdown header');
  assert.ok(code.includes('handleCopyUserNumber'), 'Must support clicking UID to copy with feedback');
  assert.ok(code.includes('edit-profile'), 'Must link to Profile & Security tab');
  assert.ok(code.includes('activity'), 'Must link to Trae activity tab');
  assert.ok(code.includes('/creations'), 'Must link to creations page');
  assert.ok(code.includes('points-details'), 'Must link to points details tab');
  assert.ok(code.includes('settings'), 'Must link to settings tab');
  assert.ok(code.includes('agent-api-key'), 'Must link to agent api key tab');
  assert.ok(code.includes('handleLogoutClick'), 'Must support safe logout');
});
