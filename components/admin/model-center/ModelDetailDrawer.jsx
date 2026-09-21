'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { CopyableId } from '@/components/admin/AdminUiClient';
import { cn } from '@/lib/utils';
import { DIALOG_TITLE, SCRIM, SHEET_PANEL } from 'studio/ui/tokens';
import {
  HEALTH_TEXT_CN,
  billingModeLabel,
  formatCredits,
  formatLatency,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  providerLabelOf,
  statusLabel,
  typeLabel,
} from '@/lib/modelCenter/view';
import { channelHealthState } from '@/lib/modelCenter/routing';
import { ModelRouteBadge, ModelStatusDot, ModelTypeBadge } from './ModelBadges';
import ModelPrimaryProvider from './ModelPrimaryProvider';
import ModelProviderSwitch from './ModelProviderSwitch';
import ModelPricingSummary from './ModelPricingSummary';
import { Loader2, PlugZap, Radar, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';

const HEALTH_TONE = {
  healthy: 'text-success',
  degraded: 'text-warning',
  unhealthy: 'text-danger',
  unknown: 'text-ink-subtle',
};

function Section({ title, children }) {
  return (
    <section className="border-t border-line-subtle px-5 py-4">
      <h3 className="text-label font-semibold uppercase tracking-[0.05em] text-ink-subtle">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-ink-subtle">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-body-sm text-ink',
          mono && 'font-mono text-label lowercase'
        )}
        title={typeof value === 'string' ? value : undefined}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}

/**
 * 延迟列只认真实探测到的数字。仅凭据校验没有网络往返，写 '—' 或 0ms 都是假数据，
 * 所以单独说明口径；探测时间与探针类型由表头的 title 与状态列承担。
 */
function probeLatencyText(route) {
  if (!Number.isFinite(route?.probeLatencyMs)) {
    return route?.probeKind === 'credential' ? '仅凭据' : '—';
  }
  return formatLatency(route.probeLatencyMs);
}

function RouteTable({ routes, primaryId }) {
  if (!routes.length) {
    return (
      <p className="rounded-md border border-dashed border-line bg-well px-3 py-4 text-center text-body-sm text-ink-subtle">
        该模型尚未在 provider_models 中挂载供应商渠道，当前只能按 models_config.provider 调用。
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-line-subtle">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-well text-caption text-ink-subtle">
            <th className="px-2.5 py-1.5 font-semibold">渠道</th>
            <th className="px-2.5 py-1.5 text-right font-semibold">优先级</th>
            <th className="px-2.5 py-1.5 text-right font-semibold">渠道成本</th>
            <th className="px-2.5 py-1.5 text-right font-semibold">探测延迟</th>
            <th className="px-2.5 py-1.5 font-semibold">状态</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const live = route.enabled && route.providerEnabled;
            const health = channelHealthState(route);
            return (
              <tr key={route.id} className="border-t border-line-subtle">
                <td className="px-2.5 py-2">
                  <p className="text-body-sm text-ink">
                    {route.providerName || route.providerId}
                    {route.id === primaryId && (
                      <span className="ml-1.5 text-caption text-success">当前使用</span>
                    )}
                  </p>
                  <p className="font-mono text-caption text-ink-subtle">{route.providerModelId}</p>
                </td>
                <td className="px-2.5 py-2 text-right font-mono text-body-sm tabular-nums text-ink-muted">
                  {route.priority}
                </td>
                <td className="px-2.5 py-2 text-right font-mono text-body-sm tabular-nums text-ink-muted">
                  {formatUsd(route.baseCost, 3)} {route.currency}
                </td>
                <td
                  className="px-2.5 py-2 text-right font-mono text-body-sm tabular-nums text-ink-muted"
                  title={route.probeCheckedAt ? `探测于 ${new Date(route.probeCheckedAt).toLocaleString()}` : '尚无探测记录'}
                >
                  {probeLatencyText(route)}
                </td>
                <td className="px-2.5 py-2 text-body-sm">
                  {!live ? (
                    <span className="text-ink-subtle">已停用</span>
                  ) : route.unavailableReason ? (
                    <span className="text-warning">{route.unavailableReason}</span>
                  ) : (
                    <span className={HEALTH_TONE[channelHealthState(route)]}>
                      {HEALTH_TEXT_CN[channelHealthState(route)]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ModelDetailDrawer({
  model,
  creditUsdRate,
  canWrite,
  pending,
  onClose,
  onConfigure,
  onToggleActive,
  onTestRoute,
  onProbeAllRoutes,
  onSwitchProvider,
}) {
  if (!model) return null;
  const routes = model.routes || [];

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          className={cn(SHEET_PANEL, 'right-0 top-0 h-full w-[600px] max-w-full border-l')}
          aria-describedby={undefined}
        >
          <div className="flex items-start gap-3 px-5 pb-4 pt-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ModelStatusDot model={model} />
                <DialogPrimitive.Title className={cn(DIALOG_TITLE, 'truncate')}>
                  {model.name}
                </DialogPrimitive.Title>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <CopyableId id={model.id} />
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="关闭详情">
                <X className="size-3.5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            <Section title="基础信息">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="模型类型" value={typeLabel(model.type)} />
                <Field label="上线状态" value={statusLabel(model)} />
                <Field label="实际供应商（主渠道）" value={providerLabelOf(model)} />
                <Field label="计费方式" value={billingModeLabel(model)} />
                <Field label="排序值" value={model.sortOrder} mono />
                <Field label="目录更新时间" value={formatRelativeTime(model.updatedAt)} />
                <Field label="最近一次调用" value={formatRelativeTime(model.lastCalledAt)} />
              </div>
            </Section>

            <Section title="成本与定价">
              <ModelPricingSummary model={model} creditUsdRate={creditUsdRate} />
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="上游实际成本 (30 天)" value={formatUsd(model.realCostUsd30d, 2)} mono />
                <Field label="Credit 折算汇率" value={creditUsdRate ? `1 Credit = ${formatUsd(creditUsdRate, 4)}` : '—'} />
                <Field label="毛利阈值" value={model.minMarginRate === null ? '未配置' : formatPercent(model.minMarginRate, 0)} />
                <Field label="绝对毛利" value={formatUsd(model.grossMarginUsd)} mono />
              </div>
            </Section>

            <Section title={`供应商路由 (${routes.length})`}>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <ModelTypeBadge model={model} />
                <ModelRouteBadge model={model} />
              </div>
              <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-line-subtle bg-well px-3 py-2">
                <div className="min-w-0">
                  <p className="text-caption text-ink-subtle">当前实际走</p>
                  <ModelPrimaryProvider model={model} className="mt-0.5" />
                </div>
                <ModelProviderSwitch
                  model={model}
                  canWrite={canWrite}
                  busy={pending}
                  onSwitch={onSwitchProvider}
                />
              </div>
              <RouteTable routes={routes} primaryId={model.primaryChannelId} />
            </Section>

            <Section title="近 30 天用量">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="调用次数" value={model.calls30d} mono />
                <Field label="今日调用" value={model.callsToday} mono />
                <Field label="成功率" value={formatPercent(model.successRate)} mono />
                <Field label="平均延迟" value={formatLatency(model.avgLatencyMs)} mono />
                <Field label="消耗 Credits" value={formatCredits(model.creditsConsumed30d)} mono />
                <Field label="今日成本" value={formatUsd(model.realCostUsdToday, 2)} mono />
              </div>
            </Section>
          </div>

          <div className="flex items-center gap-2 border-t border-line bg-overlay px-5 py-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canWrite || !routes.length || pending}
              title={
                !canWrite
                  ? '探测供应商渠道需要渠道写权限'
                  : routes.length
                    ? '向供应商网关发一次轻量探针，不提交生成任务'
                    : '该模型尚未挂载供应商渠道'
              }
              onClick={() => onTestRoute(model)}
              className="gap-1.5"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
              探测主渠道
            </Button>
            {canWrite && routes.length > 1 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                title="逐条探测该模型挂载的可服务渠道，用于确认备用供应商是否真的能接"
                onClick={() => onProbeAllRoutes(model)}
                className="gap-1.5"
              >
                <Radar className="size-3.5" />
                探测全部渠道
              </Button>
            )}
            {canWrite && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onConfigure(model)}
                  className="gap-1.5"
                >
                  <SlidersHorizontal className="size-3.5" />
                  配置定价
                </Button>
                <Button
                  variant={model.isActive ? 'danger' : 'primary'}
                  size="sm"
                  className="ml-auto gap-1.5"
                  disabled={pending}
                  onClick={() => onToggleActive(model)}
                >
                  <ShieldAlert className="size-3.5" />
                  {model.isActive ? '下线模型' : '上线模型'}
                </Button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
