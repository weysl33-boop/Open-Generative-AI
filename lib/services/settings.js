import 'server-only';

import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import * as settingsRepo from '../repositories/settings.js';
import { sanitizeChinaIpBlockConfig, saveChinaIpBlockStateToFile } from '../security/chinaIpBlock.js';

const BLOCKED_KEYS = /secret|password|token|key|private/i;

// middleware 在 Node 运行时里读不到数据库（`server-only` 与 pg 都不能进中间件），
// 所以这项配置在数据库之外还要落一份运行时镜像。镜像写失败必须让运营看到，
// 否则后台显示"已保存"而拦截其实从没开启。
const GATE_SETTING_KEY = 'china_ip_block';

export async function getSettingByKey(key) {
  return settingsRepo.getSettingByKey(key);
}

export async function getSystemSettingsList() {
  return await settingsRepo.getAllSettings();
}

export async function saveSystemSetting({ actor, key, value, visibility = 'private', requestId }) {
  if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(key)) {
    return { error: '配置键名格式无效（仅限小写字母、数字及下划线）' };
  }

  if (BLOCKED_KEYS.test(key)) {
    return { error: '系统设置中严禁存储密钥与私钥敏感信息' };
  }
  if (!['public', 'private'].includes(visibility)) return { error: '配置可见性值无效' };

  let storedValue = value;
  if (key === GATE_SETTING_KEY) {
    storedValue = sanitizeChinaIpBlockConfig({
      ...value,
      updated_by: actor?.email || null,
      updated_at: new Date().toISOString(),
    });
  }

  try {
    if (JSON.stringify(storedValue).length > 10000) return { error: '配置内容不能超过 10,000 个字符' };
  } catch {
    return { error: '配置内容必须是可序列化数据' };
  }

  const result = await withTransaction(async (tx) => {
    const existing = await settingsRepo.getSettingByKey(key, tx);
    const updated = await settingsRepo.updateSettingValue({
      key,
      value: storedValue,
      updatedBy: actor.email,
      visibility,
      transaction: tx,
    });
    await logAudit({
      actor,
      action: 'settings.update',
      targetType: 'system_setting',
      targetId: key,
      riskLevel: key === GATE_SETTING_KEY ? 'high' : 'medium',
      before: existing ? existing.value : null,
      after: storedValue,
      requestId,
      transaction: tx,
    });
    return { setting: updated };
  });

  if (key !== GATE_SETTING_KEY || result?.error) return result;

  // 先提交数据库再落镜像，反过来的话一次库失败会留下"拦截已开、库里却查无此配置"的幽灵状态。
  const mirror = saveChinaIpBlockStateToFile(storedValue);
  if (mirror.error) return { ...result, warning: mirror.error };
  return result;
}
