'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

const STATUS = {
  healthy: ['Healthy', 'good'],
  degraded: ['Degraded', 'warn'],
  unavailable: ['Unavailable', 'danger'],
  disabled: ['Disabled', 'neutral'],
  not_checked: ['Not checked', 'neutral'],
};

function statusBadge(status) {
  const [label, tone] = STATUS[status] || ['Unknown', 'neutral'];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || '请求失败');
  return payload.data ?? payload;
}

export default function EmailSmtpConfigClient({ initial, canWrite = false }) {
  const [overview, setOverview] = useState(initial);
  const [config, setConfig] = useState(initial.config);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const next = await readResponse(await fetch('/api/admin/providers/email', { cache: 'no-store' }));
    setOverview(next);
    setConfig(next.config);
  };

  const saveConfig = async (event) => {
    event.preventDefault();
    setBusy('config');
    setMessage('');
    try {
      const next = await readResponse(await fetch('/api/admin/providers/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(config),
      }));
      setOverview(next);
      setConfig(next.config);
      setMessage('邮箱配置已保存。');
    } catch (error) {
      setMessage(error.message || '邮箱配置保存失败');
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (!smtpPassword || !adminPassword) {
      setMessage('请输入 SMTP 客户端密码和当前管理员密码');
      return;
    }
    setBusy('secret');
    setMessage('');
    try {
      await readResponse(await fetch('/api/admin/providers/email/secrets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ password: smtpPassword, adminPassword }),
      }));
      setSmtpPassword('');
      setAdminPassword('');
      await refresh();
      setMessage('SMTP 客户端密码已加密保存，不会回显。');
    } catch (error) {
      setMessage(error.message || 'SMTP 密码保存失败');
    } finally {
      setBusy('');
    }
  };

  const runHealthCheck = async () => {
    setBusy('health');
    setMessage('');
    try {
      const result = await readResponse(await fetch('/api/admin/providers/email/health', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }));
      await refresh();
      setMessage(`SMTP 连接检查完成：${result.status}${result.latencyMs == null ? '' : `（${result.latencyMs} ms）`}`);
    } catch (error) {
      setMessage(error.message || 'SMTP 连接检查失败');
    } finally {
      setBusy('');
    }
  };

  const sendTest = async (event) => {
    event.preventDefault();
    if (!testRecipient.trim()) {
      setMessage('请填写你有权接收测试邮件的邮箱地址');
      return;
    }
    if (!window.confirm(`将向 ${testRecipient} 发送一封真实测试邮件。继续吗？`)) return;
    setBusy('test');
    setMessage('');
    try {
      const result = await readResponse(await fetch('/api/admin/providers/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ to: testRecipient }),
      }));
      await refresh();
      setMessage(result.message || 'SMTP 服务已接受测试邮件，请检查收件箱和垃圾邮件。');
    } catch (error) {
      setMessage(error.message || '测试邮件发送失败');
    } finally {
      setBusy('');
    }
  };

  const disabled = !canWrite || Boolean(busy);

  return (
    <div className="space-y-5">
      {message && <div role="status" className="rounded-xl border border-line bg-wash px-4 py-3 text-body text-ink">{message}</div>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-card-title text-ink">QQ 企业邮箱 SMTP</h2>
            <p className="mt-1 text-body-sm text-ink-muted">服务端连接固定使用 SSL/TLS；SMTP 密码应使用企业邮箱的客户端专用密码。</p>
          </div>
          {statusBadge(overview.status)}
        </div>
        <form onSubmit={saveConfig} className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-label text-ink-muted">
            SMTP 服务器
            <div className="flex h-9 items-center rounded-lg border border-line bg-canvas px-3 text-ink">smtp.exmail.qq.com : 465 · SSL/TLS</div>
          </div>
          <label className="flex flex-col gap-1.5 text-label text-ink-muted">
            QQ 企业邮箱账号
            <input type="email" required autoComplete="email" value={config.username || ''} disabled={disabled} onChange={(event) => setConfig((current) => ({ ...current, username: event.target.value }))} placeholder="name@company.com" className="h-9 rounded-lg border border-line bg-canvas px-3 text-body text-ink disabled:opacity-60" />
          </label>
          <label className="flex flex-col gap-1.5 text-label text-ink-muted">
            发件人显示名称
            <input type="text" maxLength={100} value={config.fromName || ''} disabled={disabled} onChange={(event) => setConfig((current) => ({ ...current, fromName: event.target.value }))} className="h-9 rounded-lg border border-line bg-canvas px-3 text-body text-ink disabled:opacity-60" />
          </label>
          <label className="flex items-center gap-2 text-label text-ink">
            <input type="checkbox" checked={config.enabled === true} disabled={disabled} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} />
            启用邮箱登录邮件发送
          </label>
          {canWrite && <div className="flex justify-end md:col-span-2"><button type="submit" disabled={disabled} className="h-9 rounded-lg bg-brand-active px-4 text-label text-ink-on-accent hover:bg-brand disabled:opacity-50">{busy === 'config' ? '保存中…' : '保存邮箱配置'}</button></div>}
        </form>
      </Card>

      {canWrite && (
        <Card>
          <h2 className="text-card-title text-ink">加密保存 SMTP 客户端密码</h2>
          <p className="mt-1 text-body-sm text-ink-muted">密码只写入服务端 AES-GCM 加密密钥库，读取接口不返回明文。留空不会覆盖现有密码。{overview.passwordConfigured ? '当前已有密码配置。' : '当前尚未配置密码。'}</p>
          <form onSubmit={savePassword} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-label text-ink-muted">SMTP 客户端专用密码
              <input type="password" autoComplete="new-password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} placeholder="仅写入，不可反显" className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink placeholder:text-ink-subtle" />
            </label>
            <label className="text-label text-ink-muted">当前管理员密码（重新验证）
              <input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink" />
            </label>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button type="button" onClick={runHealthCheck} disabled={disabled} className="h-9 rounded-lg border border-line bg-wash px-4 text-label text-ink disabled:opacity-50">{busy === 'health' ? '检查中…' : '检查 SMTP 连接'}</button>
              <button type="submit" disabled={disabled} className="h-9 rounded-lg border border-brand-line bg-brand-soft px-4 text-label text-brand-hover disabled:opacity-50">{busy === 'secret' ? '加密保存中…' : '加密保存密码'}</button>
            </div>
          </form>
        </Card>
      )}

      {canWrite && (
        <Card>
          <h2 className="text-card-title text-ink">发送测试邮件</h2>
          <p className="mt-1 text-body-sm text-warning">这会实际发送一封邮件。请只填写你有权接收的邮箱；每个管理员每小时最多测试 3 次。</p>
          <form onSubmit={sendTest} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-label text-ink-muted">测试收件邮箱
              <input type="email" required value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink" placeholder="your-address@example.com" />
            </label>
            <button type="submit" disabled={disabled || !overview.configured} className="h-9 rounded-lg border border-line bg-wash px-4 text-label text-ink disabled:opacity-50">{busy === 'test' ? '发送中…' : '发送真实测试邮件'}</button>
          </form>
          {overview.lastHealthCheck && <p className="mt-3 text-label text-ink-muted">最近连接检查：{new Date(overview.lastHealthCheck).toLocaleString()} · {overview.lastHealthLatencyMs ?? '—'} ms{overview.lastHealthError ? ` · ${overview.lastHealthError}` : ''}</p>}
        </Card>
      )}
    </div>
  );
}
