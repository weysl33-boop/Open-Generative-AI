'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatLatency, formatRelativeTime, isMarginAlert } from '@/lib/modelCenter/view';
import {
  ModelChannelBadge,
  ModelProviderBadge,
  ModelRouteBadge,
  ModelStatusDot,
  ModelTypeBadge,
} from './ModelBadges';
import ModelOnlineToggle from './ModelOnlineToggle';
import ModelProviderSwitch from './ModelProviderSwitch';
import ModelPricingSummary from './ModelPricingSummary';
import ModelActionsMenu from './ModelActionsMenu';
import { AlertCircle, CheckSquare, Square } from 'lucide-react';

export default function ModelCard({
  model,
  creditUsdRate,
  canWrite,
  pending,
  selected,
  onOpenDetail,
  onConfigure,
  onToggleActive,
  onTestRoute,
  onSwitchProvider,
  onToggleSelect,
}) {
  return (
    <article
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail();
        }
      }}
      tabIndex={0}
      aria-label={`${model.name} 详情`}
      className={cn(
        'group flex min-h-[196px] cursor-pointer flex-col rounded-lg border bg-surface p-4',
        'transition-[transform,border-color,box-shadow] duration-fast ease-standard',
        'hover:-translate-y-px hover:border-line-strong hover:shadow-elevation-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        !model.isActive && 'opacity-75',
        selected ? 'border-brand-line' : 'border-line-subtle'
      )}
    >
      {/* A · 标题区 */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={selected ? '取消选择' : '选择模型'}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(model.id);
          }}
          className={cn(
            'mt-0.5 shrink-0 rounded-xs text-ink-subtle transition-colors duration-fast',
            'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
            selected && 'opacity-100 text-brand'
          )}
        >
          {selected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ModelStatusDot model={model} />
            <h3 className="truncate text-card-title font-semibold text-ink" title={model.name}>
              {model.name}
            </h3>
            {isMarginAlert(model) && (
              <span title="毛利率低于该模型配置的阈值">
                <AlertCircle className="size-3.5 text-danger" />
              </span>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-caption text-ink-subtle" title={model.id}>
            {model.slug}
          </p>
        </div>

        <ModelProviderSwitch
          model={model}
          canWrite={canWrite}
          busy={pending}
          onSwitch={onSwitchProvider}
        />
        <ModelOnlineToggle
          model={model}
          disabled={!canWrite}
          pending={pending}
          onChange={onToggleActive}
        />
      </div>

      {/* B · 标签区 —— 单行裁切，保证卡片高度一致 */}
      <div className="mt-3 flex h-5 items-center gap-1.5 overflow-hidden">
        <ModelTypeBadge model={model} />
        <ModelProviderBadge model={model} />
        <ModelChannelBadge model={model} />
        <ModelRouteBadge model={model} />
      </div>

      {/* C · 定价区 */}
      <ModelPricingSummary model={model} creditUsdRate={creditUsdRate} className="mt-3" />

      {/* D · 底部区 */}
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <dl className="min-w-0 space-y-0.5 text-caption text-ink-subtle">
          <div className="flex items-center gap-1">
            <dt>最近同步</dt>
            <dd className="font-mono tabular-nums text-ink-muted">
              {formatRelativeTime(model.updatedAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>平均延迟</dt>
            <dd className="font-mono tabular-nums text-ink-muted">
              {formatLatency(model.avgLatencyMs)}
            </dd>
          </div>
        </dl>

        <div className="flex shrink-0 items-center gap-1">
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onConfigure(model);
              }}
            >
              配置定价
            </Button>
          )}
          <ModelActionsMenu
            model={model}
            canWrite={canWrite}
            busy={pending}
            onViewDetail={onOpenDetail}
            onConfigure={() => onConfigure(model)}
            onTestRoute={() => onTestRoute(model)}
            onToggleActive={onToggleActive}
          />
        </div>
      </div>
    </article>
  );
}
