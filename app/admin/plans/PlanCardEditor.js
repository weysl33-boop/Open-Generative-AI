'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function PlanCardEditor({ plan }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name || '');
  const [monthlyCny, setMonthlyCny] = useState(plan.monthly_cny ?? plan.monthlyCny ?? 0);
  const [monthlyUsd, setMonthlyUsd] = useState(plan.monthly_usd ?? plan.monthlyUsd ?? 0);
  const [yearlyCny, setYearlyCny] = useState(plan.yearlyCny ?? (plan.monthlyCny ? plan.monthlyCny * 10 : 0));
  const [yearlyUsd, setYearlyUsd] = useState(plan.yearlyUsd ?? (plan.monthlyUsd ? plan.monthlyUsd * 10 : 0));
  const [quotaBase, setQuotaBase] = useState(plan.quotaBase ?? (plan.id === 'starter' ? 2000 : plan.id === 'basic' ? 5000 : plan.id === 'plus' ? 10000 : plan.id === 'pro' ? 20000 : 0));
  const [quotaBonus, setQuotaBonus] = useState(plan.quotaBonus ?? (plan.id === 'starter' ? 400 : plan.id === 'basic' ? 1500 : plan.id === 'plus' ? 4000 : plan.id === 'pro' ? 10000 : 0));
  const [concurrency, setConcurrency] = useState(plan.concurrency ?? 5);
  const [asyncConcurrency, setAsyncConcurrency] = useState(plan.asyncConcurrency ?? 10);
  const [portraitCapacity, setPortraitCapacity] = useState(plan.portraitCapacity ?? 2);
  const [badge, setBadge] = useState(plan.badge || '');
  const [features, setFeatures] = useState(Array.isArray(plan.features) ? plan.features.join('\n') : '');
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
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          name,
          monthlyCny: Number(monthlyCny),
          monthlyUsd: Number(monthlyUsd),
          yearlyCny: Number(yearlyCny),
          yearlyUsd: Number(yearlyUsd),
          quotaBase: Number(quotaBase),
          quotaBonus: Number(quotaBonus),
          concurrency: Number(concurrency),
          asyncConcurrency: Number(asyncConcurrency),
          portraitCapacity: Number(portraitCapacity),
          badge,
          features: features.split('\n').map((s) => s.trim()).filter(Boolean),
          enabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || '保存失败');

      setMessage('配置已成功持久化并同步至前台！');
      setEditing(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between border-line-subtle">
      <div>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-brand-hover">
              {plan.id}
            </span>
            {badge && (
              <span className="rounded-full bg-brand-pressed px-2 py-0.5 text-micro font-semibold text-brand-hover border border-brand-line">
                {badge}
              </span>
            )}
          </div>
          <StatusBadge tone={enabled ? 'good' : 'neutral'}>
            {enabled ? '前台展示中' : '已隐藏'}
          </StatusBadge>
        </div>

        {!editing ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-bold text-ink">{name}</h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <div>
                  <span className="text-2xl font-extrabold text-brand-hover">¥{monthlyCny}</span>
                  <span className="text-xs text-ink-subtle"> /月 (${monthlyUsd})</span>
                </div>
                <div className="text-xs text-success font-medium bg-success-soft px-2 py-0.5 rounded border border-success-soft">
                  包年: ¥{yearlyCny} /年 (${yearlyUsd})
                </div>
              </div>
            </div>

            {/* 额度资产信息 */}
            <div className="rounded-xl border border-line bg-wash p-3">
              <p className="text-[11px] font-semibold text-ink-subtle mb-1.5">每月订阅额度资产：</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink">基础额度: <strong className="font-mono text-brand-hover">{quotaBase}</strong></span>
                <span className="text-ink">额外赠送: <strong className="font-mono text-success">+{quotaBonus}</strong></span>
                <span className="text-ink-subtle">月总额度: <strong className="font-mono text-warning">{Number(quotaBase) + Number(quotaBonus)}</strong></span>
              </div>
            </div>

            {/* 并发与特权限制 */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-line-subtle bg-black/20 p-2">
                <div className="text-micro text-ink-subtle">单模型并发</div>
                <div className="font-mono font-bold text-ink mt-0.5">{concurrency}</div>
              </div>
              <div className="rounded-lg border border-line-subtle bg-black/20 p-2">
                <div className="text-micro text-ink-subtle">异步并发池</div>
                <div className="font-mono font-bold text-ink mt-0.5">{asyncConcurrency}</div>
              </div>
              <div className="rounded-lg border border-line-subtle bg-black/20 p-2">
                <div className="text-micro text-ink-subtle">授权人像库</div>
                <div className="font-mono font-bold text-ink mt-0.5">{portraitCapacity}个</div>
              </div>
            </div>

            {/* 权益列表 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-subtle">包含权益矩阵：</p>
              <ul className="space-y-1.5 text-xs text-ink-muted">
                {(Array.isArray(plan.features) ? plan.features : []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-brand-hover text-[11px] mt-0.5">✔</span>
                    <span className="leading-tight">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-ink-subtle mb-1">套餐名称</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-scrim px-3 py-1.5 text-xs text-ink outline-none focus:border-brand-ring"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-subtle mb-1">活动角标 (Badge)</label>
                <input
                  type="text"
                  placeholder="如: 多送20%"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-scrim px-3 py-1.5 text-xs text-ink outline-none focus:border-brand-ring"
                />
              </div>
            </div>

            {/* 价格配置 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">连续包月 (CNY)</label>
                <input
                  type="number"
                  required
                  value={monthlyCny}
                  onChange={(e) => setMonthlyCny(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">包月 USD</label>
                <input
                  type="number"
                  required
                  value={monthlyUsd}
                  onChange={(e) => setMonthlyUsd(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">连续包年 (CNY)</label>
                <input
                  type="number"
                  required
                  value={yearlyCny}
                  onChange={(e) => setYearlyCny(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">包年 USD</label>
                <input
                  type="number"
                  required
                  value={yearlyUsd}
                  onChange={(e) => setYearlyUsd(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
            </div>

            {/* 额度配置 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">每月基础额度</label>
                <input
                  type="number"
                  required
                  value={quotaBase}
                  onChange={(e) => setQuotaBase(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm font-mono text-brand outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">额外赠送额度</label>
                <input
                  type="number"
                  required
                  value={quotaBonus}
                  onChange={(e) => setQuotaBonus(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-sm text-body-sm font-mono text-success outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
            </div>

            {/* 并发与人像容量 */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">单模型并发</label>
                <input
                  type="number"
                  value={concurrency}
                  onChange={(e) => setConcurrency(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-2.5 h-control-sm text-body-sm font-mono text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">异步并发池</label>
                <input
                  type="number"
                  value={asyncConcurrency}
                  onChange={(e) => setAsyncConcurrency(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-2.5 h-control-sm text-body-sm font-mono text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
              <div>
                <label className="block text-label font-medium text-ink-muted mb-1">人像容量</label>
                <input
                  type="number"
                  value={portraitCapacity}
                  onChange={(e) => setPortraitCapacity(e.target.value)}
                  className="w-full rounded-md border border-line-subtle bg-well px-2.5 h-control-sm text-body-sm font-mono text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>
            </div>

            <div>
              <label className="block text-label font-medium text-ink-muted mb-1">权益列表（每行一项）</label>
              <textarea
                rows={5}
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                className="w-full rounded-md border border-line-subtle bg-well p-2.5 text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-sans"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id={`enabled_${plan.id}`}
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 rounded-xs border-line-subtle bg-well text-brand focus:ring-brand-ring"
              />
              <label htmlFor={`enabled_${plan.id}`} className="text-body-sm text-ink-muted">
                在前台展示此套餐
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-control-sm inline-flex items-center rounded-md border border-line-subtle bg-raised px-3 text-label font-medium text-ink-muted hover:border-line hover:bg-overlay hover:text-ink transition-[border-color,background-color,color] duration-fast"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-control-sm inline-flex items-center rounded-md bg-brand px-4 text-label font-semibold text-ink-on-accent transition-colors duration-fast hover:bg-brand-hover shadow-elevation-1"
              >
                {busy ? '保存中…' : '保存更新'}
              </button>
            </div>
          </form>
        )}
      </div>

      {!editing && (
        <div className="mt-6 pt-4 border-t border-line-subtle flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-control-sm inline-flex items-center rounded-md border border-line-subtle bg-raised px-3 text-label font-medium text-ink transition-[border-color,background-color,color] duration-fast hover:border-brand-line hover:text-brand"
          >
            编辑定价与额度属性
          </button>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-brand-hover">{message}</p>}
    </Card>
  );
}
