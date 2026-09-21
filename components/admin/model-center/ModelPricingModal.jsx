'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from 'studio/ui/field';
import { Modal, ModalContent, ModalFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'studio/ui/overlay';
import { cn } from '@/lib/utils';
import { computePricing, creditsFromMarkup } from '@/lib/modelCenter/pricing';
import {
  billingModeLabel,
  creditValuationSourceText,
  creditValuationText,
  formatPercent,
  formatUsd,
  providerLabelOf,
} from '@/lib/modelCenter/view';
import { AlertCircle, Loader2 } from 'lucide-react';

function Readout({ label, value, tone, hint }) {
  return (
    <div className="rounded-md border border-line-subtle bg-well px-3 py-2">
      <p className="text-caption text-ink-subtle">{label}</p>
      <p
        title={hint}
        className={cn(
          'mt-0.5 font-mono text-card-title tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'brand' && 'text-brand',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          !tone && 'text-ink'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, htmlFor, hint, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,240px)] items-start gap-4 border-b border-line-subtle py-3 last:border-b-0">
      <div>
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-body-sm text-ink">
            {label}
          </Label>
        ) : (
          <p className="text-body-sm text-ink">{label}</p>
        )}
        {hint && <p className="mt-0.5 text-caption leading-4 text-ink-subtle">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function ModelPricingModal({
  model,
  creditUsdRate,
  creditValuation,
  providers,
  busy,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!model) {
      setForm(null);
      return;
    }
    setForm({
      name: model.name,
      // cost_usd 是 models_config 的历史兜底列，不能用渠道成本预填：
      // 那会让管理员以为改这里就能改官方成本，而官方成本来自供应商渠道。
      cost_usd: model.legacyCostUsd === null || model.legacyCostUsd === undefined
        ? ''
        : String(model.legacyCostUsd),
      credits_price: String(model.credits ?? 0),
      markup_draft: '',
      provider: model.provider,
    });
  }, [model]);

  // 官方成本的取值口径与快照/列表完全一致：有渠道报价就用渠道报价，否则用历史兜底列。
  const effectiveCostUsd = useMemo(() => {
    if (!model) return null;
    if (model.costSource === 'provider_channel') return model.officialCostUsd;
    if (form?.cost_usd === '' || form?.cost_usd === undefined) return null;
    const typed = Number(form.cost_usd);
    return Number.isFinite(typed) && typed > 0 ? typed : null;
  }, [form, model]);

  const pricing = useMemo(() => {
    if (!form) return null;
    return computePricing({
      providerCostUsd: effectiveCostUsd,
      credits: Number(form.credits_price) || 0,
      creditUsdRate,
    });
  }, [effectiveCostUsd, form, creditUsdRate]);

  if (!model || !form || !pricing) return null;

  const patch = (updates) =>
    setForm((value) => ({ ...value, markup_draft: '', ...updates }));
  const cost = effectiveCostUsd;
  // 只有完全没挂载渠道的模型才由 models_config.provider 决定调用对象；
  // 有渠道的模型改这里不会换掉实际供应商，所以那种情况下不提供这个输入。
  const channelless = !(model.routes || []).length;
  const needsProvider = channelless && !form.provider;
  const providerOptions = channelless
    ? [
        ...providers,
        ...(form.provider && !providers.some((item) => item.value === form.provider)
          ? [{ value: form.provider, label: form.provider }]
          : []),
      ]
    : providers;
  const belowThreshold =
    model.minMarginRate !== null &&
    model.minMarginRate !== undefined &&
    pricing.marginRate !== null &&
    pricing.marginRate < model.minMarginRate;

  const setMarkup = (next) => {
    const markup = Number(next);
    const derived =
      markup > 0 && cost > 0
        ? creditsFromMarkup({ providerCostUsd: cost, markup, creditUsdRate })
        : null;
    setForm((value) => ({
      ...value,
      markup_draft: next,
      ...(derived === null ? {} : { credits_price: String(derived) }),
    }));
  };

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent
        size="lg"
        title={`配置定价 · ${model.id}`}
        description="修改后立即写入模型配置并记录审计日志；生成链路会在下一次请求读取新值。改接供应商请用模型行上的「切换供应商」。"
      >
        <div className="text-body-sm">
          <Row label="模型名称" htmlFor="mc-name" hint="对外展示的模型名，对应 models_config.name">
            <Input id="mc-name" size="sm" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </Row>

          <Row
            label={channelless ? '目录供应商 (models_config.provider)' : '实际供应商'}
            htmlFor={channelless ? 'mc-provider' : undefined}
            hint={
              channelless
                ? '该模型还没有挂载供应商渠道，运行时按这个字段调用，所以这里是唯一能改接入对象的地方'
                : `由 ${model.routes.length} 条已挂载渠道决定，改接请在模型行的「切换供应商」里做——那才会写入真实路由`
            }
          >
            {channelless ? (
              <div className="w-full">
                <Select value={form.provider} onValueChange={(value) => patch({ provider: value })}>
                  <SelectTrigger id="mc-provider" size="sm">
                    <SelectValue>请选择供应商</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label || item.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="flex h-control-sm items-center text-body-sm text-ink">
                {providerLabelOf(model)}
              </p>
            )}
          </Row>

          <Row
            label="历史成本兜底 (USD)"
            htmlFor="mc-cost"
            hint={
              model.costSource === 'provider_channel'
                ? `对应 models_config.cost_usd，仅在没有供应商渠道报价时生效；当前官方成本取自默认供应商渠道（${formatUsd(model.officialCostUsd)}），改这里不会改变它`
                : '对应 models_config.cost_usd；该模型还没有可用的供应商渠道报价，官方成本按这里填写的值计算'
            }
          >
            <Input
              id="mc-cost"
              size="sm"
              type="number"
              min="0"
              step="0.001"
              value={form.cost_usd}
              onChange={(e) => patch({ cost_usd: e.target.value })}
            />
          </Row>

          <Row label="计费方式" hint="派生自供应商渠道的 cost_config.cost_per_second">
            <p className="text-body-sm text-ink-muted pt-1.5">{billingModeLabel(model)}</p>
          </Row>

          <Row label="用户扣除 Credits" htmlFor="mc-credits" hint="对应 models_config.credits_price，必须为整数">
            <Input
              id="mc-credits"
              size="sm"
              type="number"
              min="0"
              step="1"
              value={form.credits_price}
              onChange={(e) => patch({ credits_price: e.target.value })}
            />
          </Row>

          <Row
            label="成本倍率"
            htmlFor="mc-markup"
            hint={
              cost > 0 && creditUsdRate > 0
                ? '修改倍率将按 ceil(成本 × 倍率 ÷ 汇率) 反算 Credits'
                : '官方成本为 0 时无法按倍率反算 Credits'
            }
          >
            <Input
              id="mc-markup"
              size="sm"
              type="number"
              min="0"
              step="0.1"
              value={form.markup_draft !== '' ? form.markup_draft : (pricing.markup ?? '')}
              placeholder={pricing.markup === null ? '—' : ''}
              onChange={(e) => setMarkup(e.target.value)}
            />
          </Row>

          <Row
            label="Credit 折算汇率"
            hint={creditValuationSourceText(creditValuation)}
          >
            <p className="pt-1.5 font-mono tabular-nums text-body-sm text-ink-muted">
              {creditValuationText(creditValuation)}
            </p>
          </Row>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Readout label="预计用户售价" value={formatUsd(pricing.userPriceUsd)} tone="brand" />
          <Readout label="预计毛利" value={formatUsd(pricing.grossMarginUsd)} tone={pricing.grossMarginUsd > 0 ? 'success' : 'danger'} />
          <Readout
            label="预计毛利率"
            value={formatPercent(pricing.marginRate)}
            tone={belowThreshold ? 'danger' : 'success'}
          />
        </div>

        {belowThreshold && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-caption text-warning">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            低于该模型配置的毛利率阈值 {formatPercent(model.minMarginRate, 0)}，保存后仍会计入毛利告警统计。
          </p>
        )}

        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || needsProvider || !form.name.trim()}
            onClick={() =>
              onSubmit(model, {
                name: form.name.trim(),
                cost_usd: form.cost_usd === '' ? null : Number(form.cost_usd),
                credits_price: Math.round(Number(form.credits_price)),
                provider: form.provider,
              })
            }
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存配置
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
