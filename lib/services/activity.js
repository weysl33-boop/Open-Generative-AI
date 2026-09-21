import 'server-only';

import * as activityRepo from '../repositories/activity.js';
import * as usersRepo from '../repositories/users.js';

export async function recordUserActivity({
  userId = null,
  sessionId = null,
  category = 'general',
  action,
  targetType = null,
  targetId = null,
  modelName = null,
  metadata = {},
  ip = null,
  userAgent = null,
}) {
  try {
    return await activityRepo.insertActivityLog({
      userId,
      sessionId,
      category,
      action,
      targetType,
      targetId,
      modelName,
      metadata,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[activity service] 记录用户行为失败:', err.message);
    return null;
  }
}

/**
 * 构造 Trae 风格的 52 周完整贡献热力图网格数据
 */
function build52WeekHeatmap(dateCountMap) {
  const weeks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 计算 52 周前的周日作为起点
  const currentDayOfWeek = today.getDay(); // 0 是周日, 1 是周一...
  const totalDays = 52 * 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - totalDays + (6 - currentDayOfWeek));

  let currentWeek = [];
  let iterDate = new Date(startDate);

  while (iterDate <= today) {
    const dateStr = iterDate.toISOString().split('T')[0];
    const count = Number(dateCountMap[dateStr] || 0);
    
    // 计算活跃等级 0-4 级色阶
    let level = 0;
    if (count > 0 && count <= 2) level = 1;
    else if (count > 2 && count <= 5) level = 2;
    else if (count > 5 && count <= 10) level = 3;
    else if (count > 10) level = 4;

    currentWeek.push({
      date: dateStr,
      count,
      level,
      dayOfWeek: iterDate.getDay(),
    });

    if (currentWeek.length === 7) {
      weeks.push({
        weekIndex: weeks.length,
        days: currentWeek,
        monthLabel: iterDate.getMonth() + 1,
      });
      currentWeek = [];
    }

    iterDate.setDate(iterDate.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push({
      weekIndex: weeks.length,
      days: currentWeek,
      monthLabel: today.getMonth() + 1,
    });
  }

  return weeks;
}

export async function getActivityDashboardData(userId) {
  const user = await usersRepo.findUserById(userId);
  if (!user) return null;

  const [dateMap, metrics, topModels, preferences] = await Promise.all([
    activityRepo.getDailyHeatmap(userId),
    activityRepo.getCreationMetrics(userId),
    activityRepo.getTopModels(userId, 5),
    activityRepo.getModelPreferences(userId),
  ]);

  const createdAt = user.created_at ? new Date(user.created_at) : new Date();
  const daysSinceCreated = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  // 计算专属称号标签（参考 Trae #探险家）
  let badgeTitle = '#探险家';
  if (metrics.totalCreations >= 100 || daysSinceCreated >= 90) {
    badgeTitle = '#光影大师';
  } else if (metrics.totalCreations >= 20 || daysSinceCreated >= 30) {
    badgeTitle = '#创想先锋';
  }

  const heatmapWeeks = build52WeekHeatmap(dateMap);

  return {
    user: {
      id: user.id,
      displayName: user.display_name || `创作者#${user.id}`,
      avatarUrl: user.avatar_url,
      daysActive: daysSinceCreated,
      badgeTitle,
      isActivityPublic: user.is_activity_public !== false,
      privacySettings: user.privacy_settings || { hide_activity: false, hide_stats: false },
    },
    metrics: {
      totalCreations: metrics.totalCreations,
      activeDays: metrics.activeDays || (Object.keys(dateMap).length || 0),
      totalCredits: metrics.totalCredits,
    },
    heatmap: {
      weeks: heatmapWeeks,
      totalContributions: Object.values(dateMap).reduce((a, b) => a + b, 0),
    },
    topModels,
    preferences,
    hasData: metrics.totalCreations > 0 || Object.keys(dateMap).length > 0,
  };
}

export async function findActivityDashboardUser(identifier) {
  return usersRepo.findUserByPublicId(identifier);
}

export async function toggleFollowCreator(followerId, targetUserId) {
  return await activityRepo.toggleFollow(followerId, targetUserId);
}

export async function checkFollowStatus(followerId, targetUserId) {
  return await activityRepo.checkIsFollowing(followerId, targetUserId);
}
