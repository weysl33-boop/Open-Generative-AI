import { cn } from '@/lib/utils';
import { formatCount, formatCredits, formatPercent, formatUsd } from '@/lib/modelCenter/view';

const TONE = {
  ink: 'text-ink',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-ink-subtle',
};

function Stat({ label, value, tone = 'ink' }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 px-4 first:pl-0">
      <span className="text-caption text-ink-subtle">{label}</span>
      <span className={cn('font-mono text-section-title tabular-nums', TONE[tone])}>{value}</span>
    </div>
  );
}

export default function ModelStats({ stats }) {
  return (
    <div className="mb-4 flex items-center gap-0 overflow-x-auto border-b border-line-subtle pb-3 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <Stat label="全部模型" value={formatCount(stats.total)} />
      <Stat label="已上线" value={formatCount(stats.online)} tone="success" />
      <Stat label="已下线" value={formatCount(stats.offline)} tone="muted" />
      <Stat label="供应商" value={formatCount(stats.providers)} />
      <Stat label="今日调用" value={formatCount(stats.callsToday)} />
      <Stat label="今日成本" value={formatUsd(stats.costUsdToday, 2)} tone="warning" />
      <Stat label="Credits 收入" value={formatCredits(stats.creditsToday)} tone="brand" />
      <Stat
        label="整体毛利率"
        value={formatPercent(stats.marginRate30d)}
        tone={
          stats.marginRate30d === null
            ? 'muted'
            : stats.marginRate30d >= 0
              ? 'success'
              : 'danger'
        }
      />
    </div>
  );
}
