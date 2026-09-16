import https from 'node:https';
import http from 'node:http';

const recentAlerts = new Map();
const DEBOUNCE_MS = 5 * 60 * 1000; // 5分钟限频防风暴

export async function sendOpsAlert({ title, level = 'warn', message, details = {} }) {
  const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    // 未配置告警群机器人时仅做控制台警告记录
    console.warn(`[OPS_ALERT][${level.toUpperCase()}] ${title}: ${message}`, details);
    return { success: false, reason: '未配置 OPS_ALERT_WEBHOOK_URL' };
  }

  // 防告警风暴去重
  const alertKey = `${title}_${message}`;
  const now = Date.now();
  if (recentAlerts.has(alertKey) && now - recentAlerts.get(alertKey) < DEBOUNCE_MS) {
    return { success: true, debounced: true };
  }
  recentAlerts.set(alertKey, now);

  const levelIcons = {
    info: 'ℹ️',
    warn: '⚠️',
    danger: '🚨',
    critical: '🔥',
  };

  const icon = levelIcons[level] || '📢';
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  // 格式化文本（兼容飞书、钉钉与企业微信机器人标准 webhook 报文格式）
  const payload = {
    msgtype: 'text', // 钉钉/企微标准
    text: {
      content: `${icon} 【KoyoSIM 运维告警】${title}\n等级: ${level.toUpperCase()}\n时间: ${timestamp}\n详情: ${message}\n${Object.keys(details).length ? `附加上下文: ${JSON.stringify(details)}` : ''}`,
    },
    // 飞书自定义机器人格式兼容
    msg_type: 'text',
    content: {
      text: `${icon} 【KoyoSIM 运维告警】${title}\n等级: ${level.toUpperCase()}\n时间: ${timestamp}\n详情: ${message}\n${Object.keys(details).length ? `附加上下文: ${JSON.stringify(details)}` : ''}`,
    },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { success: res.ok, status: res.status };
  } catch (error) {
    console.error('[sendOpsAlert] 推送告警失败:', error.message);
    return { success: false, error: error.message };
  }
}
