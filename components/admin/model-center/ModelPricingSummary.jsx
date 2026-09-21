import { cn } from '@/lib/utils';
import {
  formatCredits,
  formatMarkup,
  formatPercent,
  formatUsd,
  marginTone,
} from '@/lib/modelCenter/view';

const TONE_CLASS = {
  ink: 'text-ink',
  brand: 'text-brand',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
  muted: 'text-ink-subtle',
};

export function Metric({ label, value, tone = 'ink', hint, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-caption leading-4 text-ink-subtle">{label}</p>
      <p
        title={hint}
        className={cn(
          'mt-1 truncate font-mono text-card-title tabular-nums',
          TONE_CLASS[tone] || TONE_CLASS.ink
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * 成本 → Credits → 售价 的换算链，卡片 / 列表 / 抽屉共用同一套呈现。
 */
export default function ModelPricingSummary({ model, creditUsdRate, columns = 3, className }) {
  const tone = marginTone(model);
  const marginHint =
    model.minMarginRate !== null && model.minMarginRate !== undefined
      ? `策略阈值 ${formatPercent(model.minMarginRate, 0)}`
      : '未配置毛利阈值';

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('grid gap-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        <Metric
          label="官方成本"
          value={formatUsd(model.providerCostUsd)}
          tone={model.providerCostUsd > 0 ? 'warning' : 'muted'}
        />
        <Metric label="用户 Credits" value={formatCredits(model.credits)} tone="brand" />
        <Metric
          label="用户售价"
          value={formatUsd(model.userPriceUsd)}
          hint={creditUsdRate ? `折算汇率 1 Credit = ${formatUsd(creditUsdRate, 4)}` : undefined}
        />
      </div>
      <div className="flex items-center gap-3 text-caption tabular-nums">
        <span className="text-ink-subtle">
          倍率 <span className="font-mono text-ink-muted">{formatMarkup(model.markup)}</span>
        </span>
        <span className="h-3 w-px bg-line-subtle" aria-hidden />
        <span className="text-ink-subtle">
          毛利{' '}
          <span className={cn('font-mono', TONE_CLASS[tone] || TONE_CLASS.ink)}>
            {formatPercent(model.marginRate, 1)}
          </span>
        </span>
        <span className="ml-auto truncate text-ink-subtle">{marginHint}</span>
      </div>
    </div>
  );
}
