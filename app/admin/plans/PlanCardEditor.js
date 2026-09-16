'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function PlanCardEditor({ plan }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);
  const [monthlyCny, setMonthlyCny] = useState(plan.monthly_cny);
  const [monthlyUsd, setMonthlyUsd] = useState(plan.monthly_usd);
  const [features, setFeatures] = useState(plan.features.join('\n'));
  const [enabled, setEnabled] = useState(Boolean(plan.enabled));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          monthlyCny: Number(monthlyCny),
          monthlyUsd: Number(monthlyUsd),
          features: features.split('\n').map((s) => s.trim()).filter(Boolean),
          enabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '保存失败');

      setMessage('配置已更新');
      setEditing(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <span className="font-mono text-xs uppercase tracking-wider text-cyan-300">
            {plan.id}
          </span>
          <StatusBadge tone={enabled ? 'good' : 'neutral'}>
            {enabled ? '前台展示中' : '已隐藏'}
          </StatusBadge>
        </div>

        {!editing ? (
          <div>
            <h3 className="text-xl font-bold text-white">{name}</h3>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-cyan-200">
                ¥{monthlyCny}
              </span>
              <span className="text-xs text-white/40">/ 月 (${monthlyUsd})</span>
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-white/50">包含权益特性：</p>
              <ul className="space-y-1.5 text-xs text-white/70">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-cyan-300 text-[10px]">✔</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1">套餐名称</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1">CNY 价格</label>
                <input
                  type="number"
                  required
                  value={monthlyCny}
                  onChange={(e) => setMonthlyCny(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/50 mb-1">USD 价格</label>
                <input
                  type="number"
                  required
                  value={monthlyUsd}
                  onChange={(e) => setMonthlyUsd(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1">权益列表（每行一项）</label>
              <textarea
                rows={4}
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-300/60"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id={`enabled_${plan.id}`}
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-white/20 bg-black/40"
              />
              <label htmlFor={`enabled_${plan.id}`} className="text-xs text-white/70">
                在前台展示此套餐
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-cyan-300 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-cyan-200"
              >
                {busy ? '保存中…' : '保存更新'}
              </button>
            </div>
          </form>
        )}
      </div>

      {!editing && (
        <div className="mt-6 pt-4 border-t border-white/[0.06] flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            编辑套餐属性
          </button>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-cyan-200">{message}</p>}
    </Card>
  );
}
