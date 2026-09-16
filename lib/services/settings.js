import 'server-only';

import { logAudit } from '../admin/audit.js';
import * as settingsRepo from '../repositories/settings.js';

const BLOCKED_KEYS = /secret|password|token|key|private/i;

export function getSystemSettingsList() {
  return settingsRepo.getAllSettings();
}

export function saveSystemSetting({ actor, key, value, visibility = 'private', requestId }) {
  if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(key)) {
    return { error: '配置键名格式无效（仅限小写字母、数字及下划线）' };
  }

  if (BLOCKED_KEYS.test(key)) {
    return { error: '系统设置中严禁存储密钥与私钥敏感信息' };
  }

  const existing = settingsRepo.getSettingByKey(key);
  const updated = settingsRepo.updateSettingValue({
    key,
    value,
    updatedBy: actor.email,
    visibility,
  });

  logAudit({
    actor,
    action: 'settings.update',
    targetType: 'system_setting',
    targetId: key,
    riskLevel: 'medium',
    before: existing ? existing.value : null,
    after: value,
    requestId,
  });

  return { setting: updated };
}
