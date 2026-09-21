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

const HEATMAP_WEEK_COLUMNS = 52;
const DAYS_PER_WEEK = 7;
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// 账本返回的是 DATE 文本，按本地日历逐日比对；toISOString 会按 UTC 截断一天，
// 在 UTC+8 下把每一天都写成前一天，格子与悬浮日期整体错位。
function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 构造 Trae 风格的 52 周完整贡献热力图网格数据
 */
function build52WeekHeatmap(dateCountMap) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 回退到本周围的周日再往前推整 51 周：起点若不对齐周日，
  // 「周日/周二/周四/周六」行标签就会和格子错位一整列。
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (HEATMAP_WEEK_COLUMNS - 1) * DAYS_PER_WEEK);

  const weeks = [];
  let column = [];
  const cursor = new Date(start);

  while (cursor <= today) {
    const dateStr = localDateKey(cursor);
    const count = Number(dateCountMap[dateStr] || 0);

    // 计算活跃等级 0-4 级色阶
    let level = 0;
    if (count > 0 && count <= 2) level = 1;
    else if (count > 2 && count <= 5) level = 2;
    else if (count > 5 && count <= 10) level = 3;
    else if (count > 10) level = 4;

    column.push({
      date: dateStr,
      count,
      level,
      dayOfWeek: cursor.getDay(),
    });

    if (column.length === DAYS_PER_WEEK) {
      weeks.push({ weekIndex: weeks.length, days: column });
      column = [];
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (column.length > 0) {
    weeks.push({ weekIndex: weeks.length, days: column });
  }

  // 月份刻度按「该列首日进入新月份」落在具体列上，而不是把 12 个月名等宽铺满：
  // 等宽铺满时标签宽 = 总宽/12，列宽 = 总宽/52，两者从来对不上。
  let lastLabelColumn = -Infinity;
  let previousMonth = null;
  return weeks.map((week) => {
    const month = new Date(`${week.days[0].date}T00:00:00`).getMonth();
    const isMonthStart = month !== previousMonth;
    previousMonth = month;
    const showLabel = isMonthStart && week.weekIndex - lastLabelColumn >= 3;
    if (showLabel) lastLabelColumn = week.weekIndex;
    return { ...week, monthLabel: showLabel ? MONTH_NAMES[month] : null };
  });
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
