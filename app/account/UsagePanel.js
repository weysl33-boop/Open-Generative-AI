'use client';

import { useEffect, useState } from 'react';

function formatDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

export default function UsagePanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/usage?limit=30', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '加载使用明细失败');
        if (!cancelled) setData(body);
      })
      .catch((reason) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <section className="rounded-2xl border border-line bg-wash p-5 text-sm text-ink-muted">{error}</section>;
  if (!data) return <section className="rounded-2xl border border-line bg-wash p-5 text-sm text-ink-muted">正在加载使用明细…</section>;

  const { usage, ledger } = data;
  return (
    <section className="rounded-2xl border border-line bg-wash p-5 shadow-[0_20px_80px_rgba(0,0,0,.18)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-brand-hover">Credits ledger</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">消费明细</h2>
          <p className="mt-1 text-sm text-ink-muted">BYOK 模式只记录使用轨迹，不会重复扣除你的第三方 API 费用。</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs">
          <div><div className="text-lg font-semibold text-ink">{usage.totalCreations}</div><div className="text-ink-subtle">作品数</div></div>
          <div><div className="text-lg font-semibold text-ink">{usage.creditsUsed}</div><div className="text-ink-subtle">记录积分</div></div>
          <div><div className="text-lg font-semibold text-brand-hover">{usage.balance}</div><div className="text-ink-subtle">余额</div></div>
        </div>
      </div>
      {ledger.length ? (
        <div className="divide-y divide-line rounded-xl border border-line">
          {ledger.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div><div className="text-ink">{item.reason}</div><div className="text-xs text-ink-subtle">{formatDate(item.created_at)}</div></div>
              <div className={item.delta >= 0 ? 'text-success' : 'text-warning'}>{item.delta >= 0 ? '+' : ''}{item.delta}</div>
            </div>
          ))}
        </div>
      ) : <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-subtle">还没有积分变动记录；作品完成后会显示在作品历史中。</div>}
      <p className="mt-3 text-xs text-ink-subtle">最近活动：{formatDate(usage.lastCreatedAt)} · 计费模式：{usage.mode === 'byok' ? 'BYOK' : '平台 Credits'}</p>
    </section>
  );
}
