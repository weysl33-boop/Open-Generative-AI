import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABELS,
  ROUTE_STATE_LABELS,
  channelOf,
  fallbackCountOf,
  providerLabelOf,
  routeStateOf,
  statusOf,
  typeLabel,
} from '@/lib/modelCenter/view';

const ROUTE_VARIANT = {
  ready: 'success',
  degraded: 'warning',
  blocked: 'danger',
  unmounted: 'outline',
};

export function ModelStatusDot({ model, className }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        statusOf(model) === 'online' ? 'bg-success' : 'bg-ink-disabled',
        className
      )}
    />
  );
}

export function ModelTypeBadge({ model }) {
  return <Badge variant="outline">{typeLabel(model.type)}</Badge>;
}

export function ModelProviderBadge({ model }) {
  return <Badge variant="accent">{providerLabelOf(model)}</Badge>;
}

export function ModelChannelBadge({ model }) {
  const channel = channelOf(model);
  return (
    <Badge variant={channel === 'direct' ? 'info' : 'default'}>{CHANNEL_LABELS[channel]}</Badge>
  );
}

/**
 * 路由状态 + 备用供应商数量。「有几家可切换兜底」是管理员决定是否改接前的第一个
 * 问题，只报一个颜色徽章等于把它藏起来。
 */
export function ModelRouteBadge({ model }) {
  const state = routeStateOf(model);
  const fallbacks = fallbackCountOf(model);
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant={ROUTE_VARIANT[state]}>{ROUTE_STATE_LABELS[state]}</Badge>
      {state !== 'unmounted' && (
        <span
          className={cn('font-mono text-caption tabular-nums', fallbacks ? 'text-ink-muted' : 'text-ink-subtle')}
          title={fallbacks ? '当前主渠道之外还能一键切换到的可用渠道数' : '没有可切换的备用渠道'}
        >
          备用 {fallbacks}
        </span>
      )}
    </span>
  );
}
