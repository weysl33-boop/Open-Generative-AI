'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatCredits,
  formatLatency,
  formatMarkup,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  marginTone,
  statusLabel,
  typeLabel,
} from '@/lib/modelCenter/view';
import { ModelRouteBadge, ModelStatusDot } from './ModelBadges';
import ModelPrimaryProvider from './ModelPrimaryProvider';
import ModelProviderSwitch from './ModelProviderSwitch';
import ModelOnlineToggle from './ModelOnlineToggle';
import ModelActionsMenu from './ModelActionsMenu';
import { useWindowedList } from './useWindowedList';
import { CheckSquare, Square, SlidersHorizontal } from 'lucide-react';

const MARGIN_TONE = {
  success: 'text-success',
  danger: 'text-danger',
  muted: 'text-ink-subtle',
  neutral: 'text-ink-muted',
};

const HEAD_CLASS =
  'sticky top-0 z-base h-9 whitespace-nowrap bg-surface px-3 text-left text-caption font-semibold uppercase tracking-[0.04em] text-ink-subtle';
const CELL_CLASS = 'whitespace-nowrap px-3 py-2 text-body-sm text-ink-muted';
const NUM_CLASS = 'font-mono tabular-nums';

export default function ModelList({
  models,
  allSelected,
  someSelected,
  canWrite,
  pendingIds,
  selectedIds,
  onOpenDetail,
  onConfigure,
  onToggleActive,
  onTestRoute,
  onSwitchProvider,
  onToggleSelect,
  onToggleSelectAll,
}) {
  const { limit, sentinelRef, revealMore } = useWindowedList(models.length, 100);

  return (
    <div className="overflow-auto rounded-lg border border-line-subtle bg-surface">
      <table className="w-full min-w-[1320px] border-collapse">
        <thead>
          <tr>
            <th className={cn(HEAD_CLASS, 'w-9')}>
              <button
                type="button"
                aria-label={allSelected ? '取消全选' : '全选当前结果'}
                onClick={onToggleSelectAll}
                className={cn(
                  'rounded-xs text-ink-subtle transition-colors duration-fast hover:text-ink',
                  allSelected || someSelected ? 'text-brand' : undefined
                )}
              >
                {allSelected ? (
                  <CheckSquare className="size-3.5" />
                ) : (
                  <Square className="size-3.5" />
                )}
              </button>
            </th>
            <th className={HEAD_CLASS}>模型</th>
            <th className={HEAD_CLASS}>类型</th>
            <th className={cn(HEAD_CLASS, 'w-[268px]')}>实际供应商</th>
            <th className={HEAD_CLASS}>路由 / 备用</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>官方成本</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>Credits</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>售价</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>倍率</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>毛利率</th>
            <th className={cn(HEAD_CLASS, 'text-right')}>调用 30d</th>
            <th className={HEAD_CLASS}>状态</th>
            <th className={HEAD_CLASS}>更新</th>
            <th className={cn(HEAD_CLASS, 'w-[92px] text-right')}>操作</th>
          </tr>
        </thead>
        <tbody>
          {models.slice(0, limit).map((model) => (
            <tr
              key={model.id}
              onClick={() => onOpenDetail(model)}
              className={cn(
                'h-[76px] cursor-pointer border-t border-line-subtle transition-colors duration-fast hover:bg-wash',
                // 暂停只降低一档视觉权重：整行必须仍然可读，故障与成本信息不能跟着淡掉。
                !model.isActive && 'opacity-75',
                selectedIds.has(model.id) && 'bg-brand-soft'
              )}
            >
              <td className={cn(CELL_CLASS, 'w-9')}>
                <button
                  type="button"
                  aria-label={selectedIds.has(model.id) ? '取消选择' : '选择模型'}
                  aria-pressed={selectedIds.has(model.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelect(model.id);
                  }}
                  className={cn(
                    'rounded-xs text-ink-subtle transition-colors duration-fast hover:text-ink',
                    selectedIds.has(model.id) && 'text-brand'
                  )}
                >
                  {selectedIds.has(model.id) ? (
                    <CheckSquare className="size-3.5" />
                  ) : (
                    <Square className="size-3.5" />
                  )}
                </button>
              </td>
              <td className={CELL_CLASS}>
                <div className="flex items-center gap-2">
                  <ModelStatusDot model={model} />
                  <div className="min-w-0 max-w-[220px]">
                    <p className="truncate text-body-sm font-medium text-ink">{model.name}</p>
                    <p className="truncate font-mono text-caption text-ink-subtle">{model.id}</p>
                  </div>
                </div>
              </td>
              <td className={CELL_CLASS}>{typeLabel(model.type)}</td>
              <td className={CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-1">
                  <ModelPrimaryProvider model={model} className="min-w-0 flex-1" />
                  <ModelProviderSwitch
                    model={model}
                    canWrite={canWrite}
                    busy={pendingIds.has(model.id)}
                    onSwitch={onSwitchProvider}
                  />
                </div>
              </td>
              <td className={CELL_CLASS}>
                <ModelRouteBadge model={model} />
              </td>
              <td className={cn(CELL_CLASS, NUM_CLASS, 'text-right')}>
                {formatUsd(model.providerCostUsd)}
              </td>
              <td className={cn(CELL_CLASS, NUM_CLASS, 'text-right text-brand')}>
                {formatCredits(model.credits)}
              </td>
              <td className={cn(CELL_CLASS, NUM_CLASS, 'text-right')}>
                {formatUsd(model.userPriceUsd)}
              </td>
              <td className={cn(CELL_CLASS, NUM_CLASS, 'text-right')}>{formatMarkup(model.markup)}</td>
              <td
                className={cn(
                  CELL_CLASS,
                  NUM_CLASS,
                  'text-right',
                  MARGIN_TONE[marginTone(model)] || 'text-ink-muted'
                )}
              >
                {formatPercent(model.marginRate)}
              </td>
              <td className={cn(CELL_CLASS, NUM_CLASS, 'text-right')}>{model.calls30d}</td>
              <td className={CELL_CLASS}>
                <div className="flex items-center gap-2">
                  <ModelOnlineToggle
                    model={model}
                    disabled={!canWrite}
                    pending={pendingIds.has(model.id)}
                    onChange={onToggleActive}
                  />
                  <span className="text-caption text-ink-subtle">{statusLabel(model)}</span>
                </div>
              </td>
              <td className={cn(CELL_CLASS, 'text-caption')}>
                <p className="text-ink-muted">{formatRelativeTime(model.updatedAt)}</p>
                <p className="text-ink-subtle">延迟 {formatLatency(model.avgLatencyMs)}</p>
              </td>
              <td className={cn(CELL_CLASS, 'text-right')}>
                <div className="flex items-center justify-end gap-1">
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="配置定价"
                      title="配置定价"
                      onClick={(event) => {
                        event.stopPropagation();
                        onConfigure(model);
                      }}
                    >
                      <SlidersHorizontal className="size-3.5" />
                    </Button>
                  )}
                  <ModelActionsMenu
                    model={model}
                    canWrite={canWrite}
                    busy={pendingIds.has(model.id)}
                    onViewDetail={() => onOpenDetail(model)}
                    onConfigure={() => onConfigure(model)}
                    onTestRoute={() => onTestRoute(model)}
                    onToggleActive={onToggleActive}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {limit < models.length && (
        <div ref={sentinelRef} className="flex justify-center border-t border-line-subtle py-3">
          <Button variant="ghost" size="sm" onClick={revealMore}>
            加载更多（剩余 {models.length - limit} 行）
          </Button>
        </div>
      )}
    </div>
  );
}
