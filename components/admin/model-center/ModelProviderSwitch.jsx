'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PopoverContent, PopoverRoot, PopoverTrigger } from 'studio/ui/overlay';
import { FOCUS_RING } from 'studio/ui/tokens';
import { cn } from '@/lib/utils';
import {
  HEALTH_TEXT_CN,
  formatLatency,
  formatPercent,
  formatUsd,
} from '@/lib/modelCenter/view';
import {
  channelAvailability,
  channelHealthState,
  isPrimaryChannel,
  primaryChannelOf,
  sortChannelsForDisplay,
} from '@/lib/modelCenter/routing';
import { AlertCircle, Check, Shuffle } from 'lucide-react';

function channelName(channel) {
  return channel?.providerName || channel?.providerSlug || channel?.providerId || '未知供应商';
}

/** null 经 Number() 会变成 0，所以「未知」必须先挡住再比较，否则会被当成 0 成本。 */
function positiveNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 成本未回填就是 null：不能当 0 参与增量计算，也不能显示成 $0.000。 */
function costOf(channel) {
  return positiveNumber(channel?.costUsd);
}

/** 只有真实探测记录才算延迟：没探测过的渠道不参与「最快」比较。 */
function latencyOf(channel) {
  return positiveNumber(channel?.probeLatencyMs);
}

function marginOf({ revenue, cost }) {
  if (!(revenue > 0) || cost === null) return null;
  return Number((((revenue - cost) / revenue) * 100).toFixed(1));
}

/**
 * 「成本 / 毛利 会变成多少」：一边未知就照实显示未知，
 * 缺数据不能伪造成 0 增量，否则确认面板就成了推销话术。
 */
function DeltaLine({ label, from, to, format, kind, hint }) {
  const known = from !== null && to !== null;
  const delta = known
    ? kind === 'cost'
      ? from > 0
        ? Number((((to - from) / from) * 100).toFixed(1))
        : null
      : Number((to - from).toFixed(1))
    : null;
  const worse = delta === null ? false : kind === 'cost' ? delta > 0 : delta < 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="font-mono text-body-sm tabular-nums text-ink-muted">
          {format(from)} → {format(to)}
        </span>
        {delta === null ? (
          <span className="font-mono text-caption text-ink-subtle">{hint || '无法换算'}</span>
        ) : (
          <span
            className={cn('font-mono text-caption tabular-nums', worse ? 'text-danger' : 'text-success')}
          >
            {delta > 0 ? '+' : ''}
            {delta}
            {kind === 'cost' ? '%' : 'pp'}
          </span>
        )}
      </dd>
    </div>
  );
}

function ChannelRow({ channel, current, tags, onSelect }) {
  const availability = channelAvailability(channel);
  const health = channelHealthState(channel);
  const dimmed = current || !availability.usable;

  return (
    <button
      type="button"
      onClick={() => onSelect(channel)}
      disabled={dimmed}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-2 px-2.5 py-2 text-left',
        FOCUS_RING,
        'focus-visible:ring-inset',
        dimmed ? 'cursor-default' : 'transition-colors duration-fast hover:bg-wash'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-body-sm text-ink', current && 'font-semibold')}>
            {channelName(channel)}
          </span>
          {current && (
            <Badge tone="success" className="shrink-0 gap-1 px-1 py-0">
              <Check className="size-2.5" aria-hidden />
              当前使用
            </Badge>
          )}
          {tags.map((tag) => (
            <Badge key={tag.label} tone={tag.tone} className="shrink-0 px-1 py-0">
              {tag.label}
            </Badge>
          ))}
        </span>
        <span className="mt-0.5 block truncate font-mono text-caption text-ink-subtle">
          {channel.providerSlug || channel.providerId} · {channel.providerModelId} · 优先级{' '}
          {channel.priority}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-body-sm tabular-nums text-ink">
          {formatUsd(costOf(channel))}
        </span>
        <span className="mt-0.5 block font-mono text-caption tabular-nums text-ink-subtle">
          {formatLatency(latencyOf(channel))} ·{' '}
          <span className={cn(health === 'unhealthy' && 'text-danger')}>{HEALTH_TEXT_CN[health]}</span>
        </span>
        {!availability.usable && (
          <span className="mt-0.5 block text-caption text-warning">{availability.reason}</span>
        )}
      </span>
    </button>
  );
}

/**
 * 供应商一键切换。
 *
 * 面板里每条渠道都来自 provider_models，成本 / 延迟 / 健康一律取真实落库值；
 * 选中渠道不等于切换完成，必须再过一次带成本与毛利增量的确认。请求成功后整行
 * 状态由服务端回读，失败时本地什么都不改，原供应商继续生效。
 */
export default function ModelProviderSwitch({
  model,
  canWrite,
  busy,
  onSwitch,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);

  const channels = sortChannelsForDisplay(model.routes || []);
  const primary = primaryChannelOf(model);
  const usable = channels.filter((c) => channelAvailability(c).usable);
  const alternatives = usable.filter((c) => c.id !== primary?.id);

  const costs = usable.map(costOf).filter((value) => value !== null);
  const lowestCost = costs.length > 1 ? Math.min(...costs) : null;
  const latencies = usable.map(latencyOf).filter((value) => value !== null);
  const fastestLatency = latencies.length > 1 ? Math.min(...latencies) : null;

  const tagsFor = (channel) => {
    const tags = [];
    if (lowestCost !== null && costOf(channel) === lowestCost) tags.push({ label: '成本最低', tone: 'info' });
    if (fastestLatency !== null && latencyOf(channel) === fastestLatency) {
      tags.push({ label: '延迟最低', tone: 'info' });
    }
    if (isPrimaryChannel(channel) && channel.id !== primary?.id) {
      tags.push({ label: '已钉选但不可用', tone: 'warning' });
    }
    return tags;
  };

  const revenue = positiveNumber(model.userPriceUsd);
  const currentCost =
    costOf(primary) ?? positiveNumber(model.officialCostUsd);
  const targetCost = target ? costOf(target) : null;
  const marginBefore = marginOf({ revenue, cost: currentCost });
  const marginAfter = marginOf({ revenue, cost: targetCost });
  const threshold =
    model.minMarginRate === null || model.minMarginRate === undefined
      ? null
      : Number.isFinite(Number(model.minMarginRate))
        ? Number(model.minMarginRate)
        : null;
  const belowThreshold = marginAfter !== null && threshold !== null && marginAfter < threshold;

  const confirmSwitch = async () => {
    const ok = await onSwitch(model, target, {
      message: `${model.name} 已改接到 ${channelName(target)}`,
    });
    if (ok) {
      setOpen(false);
      setTarget(null);
    } else {
      setTarget(null);
    }
  };

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTarget(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`切换 ${model.name} 的供应商`}
          title={
            !canWrite
              ? '当前账号没有模型写权限'
              : channels.length
                ? '切换实际承接流量的供应商'
                : '该模型尚未挂载供应商渠道'
          }
          disabled={!canWrite || !channels.length || busy}
          onClick={(event) => event.stopPropagation()}
          className={cn('shrink-0', className)}
        >
          <Shuffle className="size-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-panel max-w-modal"
        onClick={(event) => event.stopPropagation()}
      >
        {target ? (
          <div>
            <p className="text-label font-semibold uppercase text-ink-subtle">
              确认改接
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-body-sm text-ink">
              {channelName(primary)}
              <span className="text-ink-subtle">→</span>
              <span className="font-semibold">{channelName(target)}</span>
            </p>

            <dl className="mt-2.5 space-y-1 rounded-md border border-line-subtle bg-well px-2.5 py-2">
              <DeltaLine
                label="官方成本"
                from={currentCost}
                to={targetCost}
                format={(value) => formatUsd(value)}
                kind="cost"
              />
              <DeltaLine
                label="毛利率"
                from={marginBefore}
                to={marginAfter}
                format={(value) => (value === null ? '—' : formatPercent(value))}
                kind="margin"
              />
              {revenue !== null && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-caption text-ink-subtle">用户价格</dt>
                  <dd className="font-mono text-body-sm tabular-nums text-ink-muted">
                    {model.credits} Credits · {formatUsd(revenue)} 不变
                  </dd>
                </div>
              )}
            </dl>

            {targetCost === null && (
              <p className="mt-2 flex items-start gap-1.5 text-caption text-warning">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                目标渠道未回填成本，切换后该模型会重新落入「未配置官方成本」。
              </p>
            )}
            {belowThreshold && (
              <p className="mt-2 flex items-start gap-1.5 text-caption text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                改接后毛利率 {formatPercent(marginAfter)} 低于该模型配置的阈值{' '}
                {formatPercent(model.minMarginRate, 0)}。
              </p>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setTarget(null)} disabled={busy}>
                返回渠道列表
              </Button>
              <Button variant="primary" size="sm" onClick={confirmSwitch} loading={busy}>
                确认改接
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-label font-semibold uppercase text-ink-subtle">
              切换供应商
            </p>
            <p className="mt-0.5 truncate text-body-sm text-ink" title={model.name}>
              {model.name}
            </p>
            <p className="mt-1 text-caption text-ink-subtle">
              新请求立即改由所选供应商承接，进行中的任务不受影响。
            </p>

            <div className="mt-2 max-h-80 divide-y divide-line-subtle overflow-y-auto rounded-md border border-line-subtle">
              {channels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  current={channel.id === primary?.id}
                  tags={tagsFor(channel)}
                  onSelect={setTarget}
                />
              ))}
            </div>

            {!alternatives.length && (
              <p className="mt-2 text-caption text-warning">
                {channels.length ? '只有当前这一条渠道可用，暂时无处可切。' : '该模型没有可用的供应商渠道。'}
              </p>
            )}
            <p className="mt-2 flex items-center justify-between gap-2 text-caption text-ink-subtle">
              <span>仅设置钉选主渠道，不改优先级与计费。</span>
              <Link
                href="/admin/models/routing"
                className="shrink-0 text-brand underline-offset-2 hover:underline"
              >
                {alternatives.length ? '渠道管理' : '去接入渠道'}
              </Link>
            </p>
          </div>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
