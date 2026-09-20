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
        <h2 className="text-base font-semibold text-white">模型定价规则表</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索模型标识或名称..."
            className="w-64 rounded-lg border border-white/[0.1] bg-white/[0.03] pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* 定价表格 */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0d0e12]/90 shadow-xl backdrop-blur-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.02] uppercase tracking-[0.06em] text-gray-400">
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
          <tbody className="divide-y divide-white/[0.06]">
            {filteredList.map((p) => (
              <tr key={p.modelId} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-white font-medium">{p.modelId}</td>
                <td className="px-4 py-3 text-gray-200 font-semibold">{p.modelName}</td>
                <td className="px-4 py-3 capitalize text-gray-400">{p.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 font-medium ${p.pricingType === 'formula' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                    {p.pricingType === 'formula' ? '公式动态计费' : '固定点数计费'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono font-bold text-cyan-400">
                  {p.baseCredits} <span className="text-[10px] text-gray-500 font-normal">pts</span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">
                  {p.minCredits} pts
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">
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
                    className="rounded p-1 text-gray-400 hover:bg-white/[0.06] hover:text-cyan-400 transition-colors"
                  >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0d0e12] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">配置模型定价: {editingPricing.modelName}</h3>
            <p className="mt-1 text-xs text-gray-400 font-mono">ID: {editingPricing.modelId}</p>

            <form onSubmit={handleSavePricing} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1">计费模式</label>
                <select
                  name="pricingType"
                  defaultValue={editingPricing.pricingType}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="fixed">固定点数 (Fixed Credits)</option>
                  <option value="formula">公式动态计费 (Formula Driven)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">基准积分点数 (Base Credits)</label>
                <input
                  name="baseCredits"
                  type="number"
                  defaultValue={editingPricing.baseCredits}
                  required
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                />
                <p className="mt-1 text-[11px] text-gray-500">固定计费的每次单价，或公式计费的基础底价。</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">最低保底点数</label>
                  <input
                    name="minCredits"
                    type="number"
                    defaultValue={editingPricing.minCredits}
                    required
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">最低毛利率要求 (%)</label>
                  <input
                    name="minGrossMarginRate"
                    type="number"
                    defaultValue={(editingPricing.minGrossMarginRate * 100).toFixed(0)}
                    required
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  name="isActive"
                  id="pricingActive"
                  defaultChecked={editingPricing.isActive}
                  className="size-4 rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
                />
                <label htmlFor="pricingActive" className="text-gray-300 cursor-pointer">
                  启用该模型定价标准
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingPricing(null)}
                  className="text-gray-400 hover:text-white"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
                >
                  {isSaving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
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
