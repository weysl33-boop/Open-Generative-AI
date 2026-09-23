'use client';

import { useState, useMemo } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Coins, Search, Edit3, Loader2, AlertCircle, Percent } from 'lucide-react';

export default function PricingManagerClient({ initialPricing = [] }) {
  const [pricingList, setPricingList] = useState(initialPricing);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingPricing, setEditingPricing] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // 统计指标
  const fixedCount = useMemo(() => pricingList.filter((p) => p.pricingType === 'fixed').length, [pricingList]);
  const formulaCount = useMemo(() => pricingList.filter((p) => p.pricingType === 'formula').length, [pricingList]);

  const filteredList = useMemo(() => {
    return pricingList.filter((p) => {
      const kw = searchKeyword.toLowerCase();
      return !kw || p.modelId.toLowerCase().includes(kw) || p.modelName.toLowerCase().includes(kw);
    });
  }, [pricingList, searchKeyword]);

  const handleSavePricing = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const form = e.target;

    let formulaConfig = editingPricing.formulaConfig || {};
    if (form.formulaConfig) {
      try {
        formulaConfig = JSON.parse(form.formulaConfig.value || '{}');
      } catch (err) {
        alert('公式配置 JSON 格式错误: ' + err.message);
        setIsSaving(false);
        return;
      }
    }

    const payload = {
      modelId: editingPricing.modelId,
      pricingType: form.pricingType.value,
      baseCredits: Number(form.baseCredits.value || 0),
      minCredits: Number(form.minCredits.value || 10),
      minGrossMarginRate: Number(form.minGrossMarginRate.value || 30) / 100,
      isActive: form.isActive.checked,
      formulaConfig,
    };

    try {
      const res = await fetch('/api/admin/models/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setPricingList((prev) =>
          prev.map((item) =>
            item.modelId === payload.modelId
              ? {
                  ...item,
                  pricingType: payload.pricingType,
                  baseCredits: payload.baseCredits,
                  minCredits: payload.minCredits,
                  minGrossMarginRate: payload.minGrossMarginRate,
                  isActive: payload.isActive,
                  formulaConfig: payload.formulaConfig,
                }
              : item
          )
        );
        setEditingPricing(null);
      } else {
        alert(data.error?.message || '保存定价失败');
      }
    } catch (err) {
      alert('保存异常: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="定价配置模型总数" value={pricingList.length} hint="统一按 Credits 扣点结算" tone="info" />
        <MetricCard label="固定点数计费" value={fixedCount} hint="按单次生成一口价扣除" tone="neutral" />
        <MetricCard label="公式动态计费" value={formulaCount} hint="按分辨率/时长动态折算" tone="good" />
        <MetricCard label="标准毛利率底线" value="≥ 30%" hint="低于红线触发利润中心预警" tone="warn" />
      </div>

      {/* 搜索栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">模型定价规则表</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索模型标识或名称..."
            className="w-64 rounded-lg border border-line bg-wash pl-9 pr-3 py-1.5 text-xs text-ink placeholder-ink-subtle focus:border-brand"
          />
        </div>
      </div>

      {/* 定价表格 */}
      <div className="overflow-x-auto scrollbar-rail rounded-xl border border-line-subtle bg-surface shadow-elevation-1">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-wash uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-4 py-3.5">模型标识</th>
              <th className="px-4 py-3.5">前台显示名</th>
              <th className="px-4 py-3.5">类型</th>
              <th className="px-4 py-3.5">计费模式</th>
              <th className="px-4 py-3.5">基础扣点 (Base Credits)</th>
              <th className="px-4 py-3.5">最低保底点数</th>
              <th className="px-4 py-3.5">最低毛利率要求</th>
              <th className="px-4 py-3.5">计费状态</th>
              <th className="px-4 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {filteredList.map((p) => (
              <tr key={p.modelId} className="hover:bg-wash transition-colors">
                <td className="px-4 py-3 font-mono text-ink font-medium">{p.modelId}</td>
                <td className="px-4 py-3 text-ink font-semibold">{p.modelName}</td>
                <td className="px-4 py-3 capitalize text-ink-muted">{p.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 font-medium ${p.pricingType === 'formula' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-brand-soft text-brand border border-brand-soft'}`}>
                    {p.pricingType === 'formula' ? '公式动态计费' : '固定点数计费'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono font-bold text-brand">
                  {p.baseCredits} <span className="text-micro text-ink-subtle font-normal">pts</span>
                </td>
                <td className="px-4 py-3 font-mono text-ink">
                  {p.minCredits} pts
                </td>
                <td className="px-4 py-3 font-mono text-ink">
                  {(p.minGrossMarginRate * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={p.isActive ? 'good' : 'neutral'}>
                    {p.isActive ? '生效中' : '未开启'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditingPricing(p)}
                    className="rounded p-1 text-ink-muted hover:bg-wash-strong hover:text-brand transition-colors"
                    aria-label="编辑">
                    <Edit3 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 编辑弹窗 */}
      {editingPricing && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-elevation-4">
            <h3 className="text-section-title font-semibold text-ink">配置模型定价: {editingPricing.modelName}</h3>
            <p className="mt-1 text-caption text-ink-muted font-mono">ID: {editingPricing.modelId}</p>

            <form onSubmit={handleSavePricing} className="mt-5 space-y-4">
              <div>
                <label className="block text-label font-medium text-ink mb-1.5">计费模式</label>
                <select
                  name="pricingType"
                  defaultValue={editingPricing.pricingType}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                >
                  <option value="fixed">固定点数 (Fixed Credits)</option>
                  <option value="formula">公式动态计费 (Formula Driven)</option>
                </select>
              </div>

              <div>
                <label className="block text-label font-medium text-ink mb-1.5">基准积分点数 (Base Credits)</label>
                <input
                  name="baseCredits"
                  type="number"
                  defaultValue={editingPricing.baseCredits}
                  required
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                />
                <p className="mt-1 text-caption text-ink-subtle">固定计费的每次单价，或公式计费的基础底价。</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-label font-medium text-ink mb-1.5">最低保底点数</label>
                  <input
                    name="minCredits"
                    type="number"
                    defaultValue={editingPricing.minCredits}
                    required
                    className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                  />
                </div>
                <div>
                  <label className="block text-label font-medium text-ink mb-1.5">最低毛利率要求 (%)</label>
                  <input
                    name="minGrossMarginRate"
                    type="number"
                    defaultValue={(editingPricing.minGrossMarginRate * 100).toFixed(0)}
                    required
                    className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  name="isActive"
                  id="pricingActive"
                  defaultChecked={editingPricing.isActive}
                  className="size-4 rounded-xs border-line-subtle bg-well text-brand focus:ring-brand-ring"
                />
                <label htmlFor="pricingActive" className="text-body-sm text-ink cursor-pointer">
                  启用该模型定价标准
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-line-subtle">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setEditingPricing(null)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSaving}
                  loading={isSaving}
                >
                  保存定价
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
