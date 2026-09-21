import 'server-only';

import crypto from 'node:crypto';
import { withTransaction } from '../db/index.js';
import * as accountSettingsRepo from '../repositories/accountSettings.js';
import * as usersRepo from '../repositories/users.js';

export async function getProfile(userId) {
  return await usersRepo.getUserProfile(userId);
}

export async function updateProfile(userId, fields) {
  return await usersRepo.updateUserProfile(userId, fields);
}

export async function getPublicProfile(identifier) {
  return usersRepo.findUserByIdOrNumber(identifier);
}

export async function saveUserAvatar(userId, avatarUrl) {
  return accountSettingsRepo.updateUserAvatar(userId, avatarUrl);
}

function makeAgentApiKey() {
  return `sk-koyo-live-${crypto.randomBytes(20).toString('hex')}`;
}

export async function getOrCreateAgentApiKey(userId) {
  return withTransaction(async (tx) => {
    const row = await accountSettingsRepo.getUserAccountSettings(userId, tx, { forUpdate: true });
    if (!row) return null;
    const links = row.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    let keyInfo = links.agent_api_key;
    if (!keyInfo || !keyInfo.key) {
      keyInfo = { key: makeAgentApiKey(), createdAt: new Date().toISOString() };
      await accountSettingsRepo.updateUserAccountSettings(userId, {
        socialLinks: { ...links, agent_api_key: keyInfo },
      }, tx);
    }
    return keyInfo;
  });
}

export async function rotateAgentApiKey(userId) {
  return withTransaction(async (tx) => {
    const row = await accountSettingsRepo.getUserAccountSettings(userId, tx, { forUpdate: true });
    if (!row) return null;
    const links = row.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    const keyInfo = { key: makeAgentApiKey(), createdAt: new Date().toISOString() };
    await accountSettingsRepo.updateUserAccountSettings(userId, {
      socialLinks: { ...links, agent_api_key: keyInfo },
    }, tx);
    return keyInfo;
  });
}

export async function getUserPreferences(userId) {
  const row = await accountSettingsRepo.getUserAccountSettings(userId);
  const links = row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
  const preferences = links.preferences || { notifyOnComplete: true, highQualityPreview: true };
  return {
    locale: row?.locale || 'zh-CN',
    preferences: {
      notifyOnComplete: preferences.notifyOnComplete ?? true,
      highQualityPreview: preferences.highQualityPreview ?? true,
    },
  };
}

export async function updateUserPreferences(userId, { notifyOnComplete, highQualityPreview, locale }) {
  return withTransaction(async (tx) => {
    const row = await accountSettingsRepo.getUserAccountSettings(userId, tx, { forUpdate: true });
    if (!row) return null;
    const links = row.social_links && typeof row.social_links === 'object' ? row.social_links : {};
    const preferences = {
      ...(links.preferences || {}),
      ...(notifyOnComplete !== undefined ? { notifyOnComplete: Boolean(notifyOnComplete) } : {}),
      ...(highQualityPreview !== undefined ? { highQualityPreview: Boolean(highQualityPreview) } : {}),
    };
    const targetLocale = locale === undefined ? row.locale || 'zh-CN' : locale;
    await accountSettingsRepo.updateUserAccountSettings(userId, {
      socialLinks: { ...links, preferences },
      locale: targetLocale,
    }, tx);
    return { preferences, locale: targetLocale };
  });
}

export async function updatePrivacySettings(userId, values) {
  return usersRepo.updateUserPrivacySettings(userId, values);
}
