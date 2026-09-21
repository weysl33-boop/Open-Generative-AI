import 'server-only';

import * as notificationsRepo from '../repositories/notifications.js';

export async function getUserNotifications(userId, limit = 20) {
  return notificationsRepo.getUserNotifications(userId, limit);
}

export async function getUnreadNotificationCount(userId) {
  return notificationsRepo.getUnreadNotificationCount(userId);
}

export async function markAllNotificationsAsRead(userId) {
  return notificationsRepo.markAllNotificationsAsRead(userId);
}
