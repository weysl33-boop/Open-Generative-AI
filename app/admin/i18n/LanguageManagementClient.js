'use client';

import { useMemo, useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

const STATUS_LABELS = {
  source: 'English 基准',
  translated: '已翻译',
  missing: '缺失',
  fallback: 'English fallback',
  'format-error': '格式错误',
  invalid: '无效',
};

function tone(status) {
  if (status === 'translated' || status === 'source') return 'good';
  if (status === 'fallback' || status === 'missing') return 'warn';
  return 'danger';
}

export default function LanguageManagementClient({ initialSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [locale, setLocale] = useState('ja-JP');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const selected = snapshot?.catalogs?.[locale];
  const fields = useMemo(() => (selected?.fields || []).filter((field) => {
    const matchesQuery = !query || `${field.key} ${field.english} ${field.value}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === 'all' || field.status === status;
    return matchesQuery && matchesStatus;
  }), [query, selected, status]);

  async function refresh() {
    const response = await fetch('/api/admin/i18n', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || '刷新失败');
    setSnapshot(payload.data);
  }

  async function saveField(field, action = 'draft') {
    const value = drafts[field.key] ?? field.value;
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch('/api/admin/i18n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ locale, key: field.key, value, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || '保存失败');
      await refresh();
      setDrafts((current) => { const next = { ...current }; delete next[field.key]; return next; });
      setFeedback(action === 'publish' ? '字段已保存并发布' : '草稿已保存');
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishLocale() {
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch('/api/admin/i18n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ locale, action: 'publish-locale' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || '发布失败');
      await refresh();
      setFeedback(`已发布 ${locale}`);
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {(snapshot?.locales || []).map((item) => (
          <button key={item.locale} type="button" onClick={() => setLocale(item.locale)} className={`text-left ${locale === item.locale ? 'ring-2 ring-brand-ring' : ''}`}>
            <Card className="h-full p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{item.name}</p>
                <StatusBadge tone={item.coverage >= 100 ? 'good' : 'warn'}>{item.coverage.toFixed(2)}%</StatusBadge>
              </div>
              <p className="mt-2 font-mono text-[11px] text-ink-subtle">{item.locale}</p>
              <p className="mt-3 text-xs text-ink-muted">{item.completed} / {item.total} 有效翻译</p>
              <p className="mt-1 text-[11px] text-ink-subtle">缺失 {item.missing} · fallback {item.fallback} · 格式错误 {item.formatErrors}</p>
            </Card>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="text-base font-bold text-ink">{selected?.name} 字段</h2>
            <p className="mt-1 text-xs text-ink-subtle">真实翻译才计入覆盖率；English fallback 只作为运行时安全回退。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 key 或文案" className="w-56 rounded-xl border border-line bg-scrim px-3 py-2 text-xs text-ink outline-none focus:border-brand-ring" />
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink">
              <option value="all">全部状态</option>
              {Object.entries(STATUS_LABELS).filter(([key]) => key !== 'source').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={publishLocale} className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-ink-on-accent disabled:opacity-50">发布当前语言</button>
          </div>
        </div>

        {feedback && <p role="status" className="mt-4 rounded-xl border border-brand-soft bg-brand-soft px-3 py-2 text-xs text-brand-hover">{feedback}</p>}

        <div className="mt-4 space-y-3">
          {fields.map((field) => (
            <div key={field.key} className="rounded-xl border border-line bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-brand-hover">{field.key}</p>
                  <p className="mt-1 text-xs text-ink-subtle">English：{field.english}</p>
                </div>
                <StatusBadge tone={tone(field.status)}>{STATUS_LABELS[field.status] || field.status}</StatusBadge>
              </div>
              {locale !== 'en' && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs text-ink-subtle">
                    {selected.name} 文案
                    <textarea value={drafts[field.key] ?? field.value ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))} rows={2} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand-ring" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => saveField(field)} className="rounded-xl border border-line-strong bg-wash px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">保存草稿</button>
                    <button type="button" disabled={busy} onClick={() => saveField(field, 'publish')} className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-ink-on-accent disabled:opacity-50">发布字段</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!fields.length && <p className="py-10 text-center text-sm text-ink-subtle">没有符合筛选条件的字段</p>}
        </div>
      </Card>
    </div>
  );
}
