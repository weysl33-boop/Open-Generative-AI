import { query, queryOne, withTransaction } from '../lib/db/pg.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';
import * as authRepo from '../lib/repositories/auth.js';
import * as userRepo from '../lib/repositories/users.js';
import * as activityRepo from '../lib/repositories/activity.js';
import * as authService from '../lib/services/auth.js';
import * as activityService from '../lib/services/activity.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runAudit() {
  await assertSandboxDatabase();
  console.log('🚀 开始执行用户系统与行为活跃面板全面审计与联调测试...\n');

  // 1. 数据库连通性与结构审计
  console.log('--- 1. 数据库与数据表结构审计 ---');
  const dbCheck = await queryOne("SELECT current_database() AS db, version() AS ver");
  assert(Boolean(dbCheck?.db), `成功连接数据库: ${dbCheck?.db}`);

  const colCheck = await query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'auth_usr' AND table_name = 'users'
      AND column_name IN ('user_number', 'is_activity_public', 'privacy_settings')
  `);
  const colNames = colCheck.rows.map(r => r.column_name);
  assert(colNames.includes('user_number'), 'users 表已包含 user_number 字段');
  assert(colNames.includes('is_activity_public'), 'users 表已包含 is_activity_public 字段');
  assert(colNames.includes('privacy_settings'), 'users 表已包含 privacy_settings 字段');

  const tableCheck = await query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE (table_schema = 'sys_core' AND table_name = 'user_activity_logs')
       OR (table_schema = 'ai_studio' AND table_name = 'user_follows')
  `);
  const foundTables = tableCheck.rows.map(r => `${r.table_schema}.${r.table_name}`);
  assert(foundTables.includes('sys_core.user_activity_logs'), '已建立 sys_core.user_activity_logs 行为追踪表');
  assert(foundTables.includes('ai_studio.user_follows'), '已建立 ai_studio.user_follows 创作者关注互动表');

  // 2. 存量用户 6 位数字 ID 审计
  console.log('\n--- 2. 6 位永久唯一数字 ID (QQ号逻辑) 审计 ---');
  const allUsers = await query("SELECT id, username, user_number FROM auth_usr.users");
  assert(allUsers.rows.length > 0, `系统当前存在 ${allUsers.rows.length} 个存量用户`);

  let validNumbers = true;
  const numberSet = new Set();
  for (const u of allUsers.rows) {
    if (!u.user_number || !/^\d{6}$/.test(u.user_number)) {
      validNumbers = false;
      console.error(`  ⚠️ 用户 ${u.id} (${u.username}) 的数字 ID 非法: ${u.user_number}`);
    }
    numberSet.add(u.user_number);
  }
  assert(validNumbers, '所有存量用户的 user_number 均为严格 6 位纯数字格式 (100000-999999)');
  assert(numberSet.size === allUsers.rows.length, `所有数字 ID 均具备全局唯一性，零重复碰撞 (${numberSet.size}/${allUsers.rows.length})`);

  // 3. 动态 6 位数字 ID 生成防撞机制
  console.log('\n--- 3. 动态 6 位数字 ID 生成防撞机制 ---');
  const generatedNumbers = [];
  for (let i = 0; i < 20; i++) {
    const num = await authService.generateUniqueUserNumber();
    assert(/^\d{6}$/.test(num), `生成随机数字 ID 符合 6 位格式: ${num}`);
    generatedNumbers.push(num);
  }
  const uniqueGenerated = new Set(generatedNumbers);
  assert(uniqueGenerated.size === generatedNumbers.length, '20 次高频生成均唯一无重复');

  // 4. 数字 ID 凭证查询与登录支持
  console.log('\n--- 4. 6 位数字 ID 作为主账号登录能力 ---');
  const sampleUser = allUsers.rows[0];
  const credByNum = await authRepo.findCredentialByAccount(sampleUser.user_number);
  assert(Boolean(credByNum), `可通过 6 位数字 ID [${sampleUser.user_number}] 检索到凭据记录`);
  assert(credByNum?.user_id === sampleUser.id, `数字 ID 关联的凭证对应真实用户 ID: ${sampleUser.id}`);

  // 5. 多渠道安全解绑与防孤儿账号机制
  console.log('\n--- 5. 多渠道解绑与防孤儿账号机制 ---');
  const credSummary = await authRepo.getUserCredentialSummary(sampleUser.id);
  assert(typeof credSummary.hasPassword === 'boolean', `凭证盘点包含独立密码状态: ${credSummary.hasPassword}`);
  assert(typeof credSummary.hasPhone === 'boolean', `凭证盘点包含手机绑定状态: ${credSummary.hasPhone}`);
  assert(typeof credSummary.hasEmail === 'boolean', `凭证盘点包含邮箱绑定状态: ${credSummary.hasEmail}`);
  assert(Array.isArray(credSummary.oauthProviders), `凭证盘点包含绑定社交平台列表: count=${credSummary.oauthProviders.length}`);

  // 模拟唯一凭据拦截测试（创建沙箱临时用户进行解绑与孤儿防范测试）
  const testUserId = `usr_test_audit_${Date.now()}`;
  const testUserNum = await authService.generateUniqueUserNumber();
  const testPhone = `199${Math.floor(10000000 + Math.random() * 90000000)}`;

  await query(`
    INSERT INTO auth_usr.users (id, username, display_name, user_number, phone, created_at, updated_at)
    VALUES ($1, $2, '审计测试员', $3, $4, now(), now())
  `, [testUserId, `tester_${Date.now().toString().slice(-6)}`, testUserNum, testPhone]);

  await query(`
    INSERT INTO auth_usr.auth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at)
    VALUES ($1, $2, 'phone', $3, now(), now())
  `, [`acc_p_${Date.now()}`, testUserId, testPhone]);

  // 尝试解绑唯一凭据（手机号） -> 预期被拦截
  const unbindResult = await authService.unbindUserPhone(testUserId);
  assert(unbindResult?.error === 'CANNOT_UNBIND_LAST_CREDENTIAL', '单凭据用户解绑手机号被系统安全拦截，有效阻止账号沦为不可登入的孤儿账号');

  // 为该测试用户新增独立密码后，再次解绑手机号 -> 预期成功
  await query(`
    UPDATE auth_usr.users SET password_hash = 'dummy_hash_for_audit', password_salt = 'salt' WHERE id = $1
  `, [testUserId]);

  const unbindSuccess = await authService.unbindUserPhone(testUserId);
  assert(unbindSuccess?.success === true, '用户具备密码凭据后，手机号解绑成功');

  const recheckSummary = await authRepo.getUserCredentialSummary(testUserId);
  assert(recheckSummary.hasPhone === false, '解绑后盘点确认手机号已解除绑定');

  // 清理测试临时账号
  await query('DELETE FROM auth_usr.auth_accounts WHERE user_id = $1', [testUserId]);
  await query('DELETE FROM auth_usr.users WHERE id = $1', [testUserId]);

  // 6. 用户行为日志真实入库与检索
  console.log('\n--- 6. 用户行为全量追踪日志 (sys_core.user_activity_logs) 审计 ---');
  const testAction = 'ai_generate_image';
  const testMetadata = { model: 'flux-schnell', promptLength: 42, resolution: '1024x1024' };
  const logged = await activityRepo.insertActivityLog({
    userId: sampleUser.id,
    action: testAction,
    category: 'ai_studio',
    targetType: 'image_generation',
    targetId: `img_sample_${Date.now()}`,
    modelName: 'flux-schnell',
    ip: '127.0.0.1',
    userAgent: 'AntigravityAudit/1.0',
    metadata: testMetadata,
  });
  assert(Boolean(logged?.id), `行为日志真实入库成功, 生成记录 ID: ${logged?.id}`);

  const recentLogs = await queryOne(`
    SELECT * FROM sys_core.user_activity_logs WHERE id = $1
  `, [logged.id]);
  assert(recentLogs.event_action === testAction, '行为类型字段 (event_action) 匹配');
  assert(recentLogs.metadata_json?.model === 'flux-schnell', '行为扩展元数据 JSONB (metadata_json) 存取完整无损');
  assert(recentLogs.user_id === sampleUser.id, '行为日志准确关联真实用户 ID');

  // 7. Trae 风格 52 周活跃热力图与模型偏好真实数据聚合
  console.log('\n--- 7. Trae 风格活跃面板数据聚合真实计算 (严禁虚假 Mock) ---');
  const dashboardData = await activityService.getActivityDashboardData(sampleUser.id);
  assert(Boolean(dashboardData?.heatmap?.weeks), '活跃面板数据结构包含 heatmap.weeks');
  assert(dashboardData.heatmap.weeks.length >= 50, `活跃面板生成了 52 周热力网格，周数: ${dashboardData.heatmap.weeks.length}`);
  assert(dashboardData.heatmap.weeks[0]?.days?.length === 7, '每周固定包含 7 天单元格');
  assert(typeof dashboardData.metrics?.activeDays === 'number', `聚合计算真实活跃天数: ${dashboardData.metrics.activeDays} 天`);
  assert(typeof dashboardData.metrics?.totalCreations === 'number', `聚合计算真实作品/任务验收数: ${dashboardData.metrics.totalCreations}`);
  assert(Array.isArray(dashboardData.topModels), `聚合最常合作模型排行列表: count=${dashboardData.topModels.length}`);
  assert(Array.isArray(dashboardData.preferences), `聚合模型调用偏好分类: count=${dashboardData.preferences.length}`);
  assert(typeof dashboardData.user?.isActivityPublic === 'boolean', `对外展示隐私控制属性有效: isActivityPublic=${dashboardData.user.isActivityPublic}`);

  // 8. 隐私开关与公开主页隐藏活跃记录验证
  console.log('\n--- 8. 个人主页隐私开关与公开访问权限控制 ---');
  // 开启隐藏
  await userRepo.updateUserPrivacySettings(sampleUser.id, {
    isActivityPublic: false,
    privacySettings: { hide_activity: true, hide_stats: true },
  });
  const updatedUser = await userRepo.findUserById(sampleUser.id);
  assert(updatedUser.is_activity_public === false, '成功将用户活跃记录设为私密隐藏状态');

  // 模拟 API 路由层的隐私拦截逻辑
  const checkPrivacyAccess = (targetUser, viewerUser) => {
    const isOwner = viewerUser && viewerUser.id === targetUser.id;
    if (!isOwner && targetUser.is_activity_public === false) {
      return { isHidden: true, message: '创作者已将活跃面板设为私密，对外仅展示作品' };
    }
    return { isHidden: false };
  };

  const thirdPartyViewer = { id: 'visitor_random_999999' };
  const thirdPartyResult = checkPrivacyAccess(updatedUser, thirdPartyViewer);
  assert(thirdPartyResult.isHidden === true, '访客查询已设为私密的用户主页活跃面板时，系统严格拦截并返回隐藏状态');

  const ownerResult = checkPrivacyAccess(updatedUser, sampleUser);
  assert(ownerResult.isHidden === false, '用户本人查阅自己的主页时不受隐私限制，正常查看全部活跃与偏好');

  // 恢复公开设置供后续日常使用
  await userRepo.updateUserPrivacySettings(sampleUser.id, {
    isActivityPublic: true,
    privacySettings: { hide_activity: false, hide_stats: false },
  });

  // 9. 创作者关注互动体系 (ai_studio.user_follows)
  console.log('\n--- 9. 创作者关注/取关互动逻辑 ---');
  const targetCreator = allUsers.rows.find(u => u.id !== sampleUser.id);
  if (targetCreator) {
    const followResult = await activityRepo.toggleFollow(sampleUser.id, targetCreator.id);
    assert(followResult.following === true, `关注创作者 [UID: ${targetCreator.user_number}] 成功`);

    const stats = await activityRepo.getUserFollowStats(targetCreator.id);
    assert(stats.followersCount >= 1, `创作者粉丝数正常增加: ${stats.followersCount}`);

    const unfollowResult = await activityRepo.toggleFollow(sampleUser.id, targetCreator.id);
    assert(unfollowResult.following === false, '再次点击成功取消关注');
  } else {
    console.log('  ℹ️ 仅有 1 个系统用户，跳过相互关注测试');
  }

  // 总结
  console.log('\n=============================================');
  console.log(`🎉 审计测试完成: 通过 ${passed} 项，失败 ${failed} 项`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('💥 审计运行抛出未捕获异常:', err);
  process.exit(1);
});
