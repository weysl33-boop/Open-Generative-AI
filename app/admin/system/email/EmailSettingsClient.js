'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

const STATUS = {
  healthy: ['已连通', 'good'],
  degraded: ['降级', 'warn'],
  unavailable: ['不可用', 'danger'],
  disabled: ['未启用', 'neutral'],
  not_checked: ['未检查', 'neutral'],
};

function statusBadge(status) {
  const [label, tone] = STATUS[status] || ['未知', 'neutral'];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || '请求失败');
  return payload.data ?? payload;
}

const field = 'h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring disabled:opacity-60 placeholder:text-ink-subtle';
const label = 'flex flex-col gap-1.5 text-body-xs font-medium text-ink-muted';
const secondary = 'inline-flex h-control-md items-center justify-center rounded-md border border-line-subtle bg-surface px-4 text-body-sm font-medium text-ink transition hover:bg-wash active:bg-wash-press disabled:opacity-50';
const primary = 'inline-flex h-control-md items-center justify-center rounded-md bg-brand px-4 text-body-sm font-medium text-ink-on-accent transition hover:bg-brand-hover active:bg-brand-active disabled:opacity-50';

export default function EmailSettingsClient({ initial, canWrite }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [form, setForm] = useState({
    enabled: initial.config.enabled === true,
    username: initial.config.username || '',
    fromName: initial.config.fromName || '',
    password: '',
    adminPassword: '',
  });
  const [testRecipient, setTestRecipient] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const apply = (next) => {
    setOverview(next);
    setForm((current) => ({ ...current, username: next.config.username || '', fromName: next.config.fromName || '', password: '', adminPassword: '' }));
    router.refresh();
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    setMessage('');
    try {
      const next = await readResponse(await fetch('/api/admin/providers/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(form),
      }));
      apply(next);
      setMessage('发信设置已保存。');
    } catch (error) {
      setMessage(error.message || '发信设置保存失败');
    } finally {
      setBusy('');
    }
  };

  const checkConnection = async () => {
    setBusy('health');
    setMessage('');
    try {
      const result = await readResponse(await fetch('/api/admin/providers/email/health', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }));
      setOverview(await readResponse(await fetch('/api/admin/providers/email', { cache: 'no-store' })));
      router.refresh();
      setMessage(`连接检查完成：${result.status === 'healthy' ? '已连通' : result.status}${result.latencyMs == null ? '' : ` · ${result.latencyMs} ms`}`);
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
      setMessage(result.message || 'SMTP 服务已接受测试邮件，请检查收件箱和垃圾邮件。');
      router.refresh();
    } catch (error) {
      setMessage(error.message || '测试邮件发送失败');
    } finally {
      setBusy('');
    }
  };

  const disabled = !canWrite || Boolean(busy);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-card-title text-ink">SMTP 发信设置</h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            QQ 企业邮箱固定走 smtp.exmail.qq.com : 465 · SSL/TLS；密码仅写入服务端 AES-GCM 密钥库，读取接口不返回明文，留空则保留现有密码。
          </p>
        </div>
        {statusBadge(overview.status)}
      </div>

      <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={label}>
          SMTP 服务器
          <div className="flex h-control-md items-center rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink">smtp.exmail.qq.com : 465 · SSL/TLS</div>
        </div>
        <label className={label}>
          QQ 企业邮箱账号
          <input type="email" required autoComplete="email" value={form.username} disabled={disabled} onChange={set('username')} placeholder="name@company.com" className={field} />
        </label>
        <label className={label}>
          发件人显示名称
          <input type="text" maxLength={100} value={form.fromName} disabled={disabled} onChange={set('fromName')} className={field} />
        </label>
        <label className={label}>
          SMTP 客户端专用密码
          <input type="password" autoComplete="new-password" value={form.password} disabled={disabled} onChange={set('password')} placeholder={overview.passwordConfigured ? '已设置 · 留空则不覆盖' : '仅写入，不可反显'} className={field} />
        </label>
        {form.password && (
          <label className={label}>
            当前管理员密码（改密必填）
            <input type="password" autoComplete="current-password" value={form.adminPassword} disabled={disabled} onChange={set('adminPassword')} className={field} />
          </label>
        )}
        <label className="flex items-center gap-2 text-body-sm text-ink md:col-span-2">
          <input type="checkbox" checked={form.enabled} disabled={disabled} onChange={set('enabled')} className="h-4 w-4 rounded border-line-subtle text-brand focus:ring-brand-ring" />
          启用邮箱登录邮件发送
        </label>
        {canWrite && (
          <div className="flex justify-end md:col-span-2">
            <button type="submit" disabled={disabled} className={primary}>{busy === 'save' ? '保存中…' : '保存发信设置'}</button>
          </div>
        )}
      </form>

      {canWrite && (
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line-subtle pt-5">
          <label className={`${label} min-w-0 flex-1`}>
            测试收件邮箱
            <input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="your-address@example.com" className={field} />
          </label>
          <button type="button" onClick={checkConnection} disabled={disabled} className={secondary}>{busy === 'health' ? '检查中…' : '检查连接'}</button>
          <button type="button" onClick={sendTest} disabled={disabled || !overview.configured} className={secondary}>{busy === 'test' ? '发送中…' : '发送真实测试邮件'}</button>
        </div>
      )}

      <p className="mt-3 text-body-xs text-ink-subtle">
        {message || `最近连接检查：${overview.lastHealthCheck ? new Date(overview.lastHealthCheck).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'}${overview.lastHealthLatencyMs != null ? ` · ${overview.lastHealthLatencyMs} ms` : ''}${overview.lastHealthError ? ` · ${overview.lastHealthError}` : ''}`}
      </p>
    </Card>
  );
}
