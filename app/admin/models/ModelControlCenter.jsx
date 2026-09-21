'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmActionDialog } from '@/components/admin/AdminUiClient';
import ModelDetailDrawer from '@/components/admin/model-center/ModelDetailDrawer';
import ModelFilterGroups, { ModelFilterSidebar } from '@/components/admin/model-center/ModelFilterGroups';
import BulkActionBar from '@/components/admin/model-center/BulkActionBar';
import ModelHeader from '@/components/admin/model-center/ModelHeader';
import ModelStats from '@/components/admin/model-center/ModelStats';
import ModelToolbar from '@/components/admin/model-center/ModelToolbar';
import ModelGrid from '@/components/admin/model-center/ModelGrid';
import ModelList from '@/components/admin/model-center/ModelList';
import ModelPricingModal from '@/components/admin/model-center/ModelPricingModal';
import {
  ModelEmptyState,
  ModelErrorState,
  ModelSkeletonGrid,
} from '@/components/admin/model-center/ModelStates';
import { creditsFromMarkup, deriveModel } from '@/lib/modelCenter/pricing';
import { costUsdToNumber } from '@/lib/modelCenter/routing';
import { deriveModelStats } from '@/lib/modelCenter/stats';
import {
  buildFacets,
  filterModels,
  parseViewState,
  probeFeedback,
  serializeViewState,
  sortModels,
} from '@/lib/modelCenter/view';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from 'studio/ui/overlay';
import { AlertCircle, CheckCircle2, SlidersHorizontal } from 'lucide-react';

export default function ModelControlCenter({ initialSnapshot, initialParams, canWrite }) {
  // models 与 stats 必须一起更新：统计卡如果只在服务端快照时算一次，
  // 行内改完价之后卡片还留着旧数字，管理员看到的就不是当前状态。
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const models = snapshot.models;
  const stats = snapshot.stats;
  // 估值口径来自系统设置，跟着快照走：客户端自己算的毛利必须和后端同一个数字。
  const rate = snapshot.creditUsdRate;
  const creditValuation = snapshot.creditValuation;
  const [state, setState] = useState(() => parseViewState(initialParams));
  const [selected, setSelected] = useState(() => new Set());
  const [pending, setPending] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [pricingId, setPricingId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bulk, setBulk] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const facets = useMemo(() => buildFacets(models), [models]);
  const visible = useMemo(
    () => sortModels(filterModels(models, state.filters), state.sort),
    [models, state.filters, state.sort]
  );
  const detailModel = useMemo(() => models.find((m) => m.id === detailId) || null, [models, detailId]);
  const pricingModel = useMemo(() => models.find((m) => m.id === pricingId) || null, [models, pricingId]);

  const notify = useCallback((text, tone = 'success') => setToast({ text, tone }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const query = serializeViewState(state);
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', next);
    }
  }, [state]);

  useEffect(() => {
    const onPopState = () =>
      setState(parseViewState(Object.fromEntries(new URLSearchParams(window.location.search))));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const commitModels = useCallback((updater) => {
    setSnapshot((prev) => {
      const next = updater(prev.models);
      return { ...prev, models: next, stats: { ...prev.stats, ...deriveModelStats(next) } };
    });
  }, []);

  const markPending = useCallback((id, on) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const mergeUpdates = useCallback(
    (model, updates) =>
      deriveModel(
        {
          ...model,
          name: updates.name ?? model.name,
          isActive: updates.is_active ?? model.isActive,
          provider: updates.provider ?? model.provider,
          sortOrder: updates.sort_order ?? model.sortOrder,
          credits: updates.credits_price ?? model.credits,
          // cost_usd 是 models_config 上的历史列，只在没有渠道成本时生效；
          // 回算必须走 deriveModel 的同一套口径，否则保存后行内的数字会自相矛盾。
          legacyCostUsd:
            updates.cost_usd === undefined
              ? model.legacyCostUsd
              : costUsdToNumber({ baseCost: updates.cost_usd, currency: 'USD' }),
          metadata:
            updates.routing_mode === undefined
              ? model.metadata
              : { ...model.metadata, routing_mode: updates.routing_mode },
        },
        rate
      ),
    [rate]
  );

  const applyPatch = useCallback(
    async (model, updates, options = {}) => {
      if (!canWrite) {
        notify('当前账号没有模型写权限', 'danger');
        return false;
      }
      markPending(model.id, true);
      try {
        const res = await fetch(`/api/admin/models/${encodeURIComponent(model.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(updates),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || `更新失败 (HTTP ${res.status})`);

        commitModels((prev) => prev.map((item) => (item.id === model.id ? mergeUpdates(item, updates) : item)));
        if (options.message) notify(options.message, options.tone || 'success');
        return true;
      } catch (err) {
        notify(err.message || '模型配置更新失败', 'danger');
        return false;
      } finally {
        markPending(model.id, false);
      }
    },
    [canWrite, commitModels, markPending, mergeUpdates, notify]
  );

  /**
   * 切换默认供应商：请求只送 channelId，响应里那一行（路由、成本、毛利、健康）
   * 全部由后端从数据库回读。前端不本地拼一个新状态，失败时原供应商保持不变。
   */
  const applyProviderSwitch = useCallback(
    async (model, channel, options = {}) => {
      if (!canWrite) {
        notify('当前账号没有模型写权限', 'danger');
        return false;
      }
      markPending(model.id, true);
      try {
        const res = await fetch(`/api/admin/models/${encodeURIComponent(model.id)}/provider`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ channelId: channel.id }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || `供应商切换失败 (HTTP ${res.status})`);

        commitModels((prev) => prev.map((item) => (item.id === model.id ? payload.data : item)));
        if (options.message) notify(options.message, options.tone || 'success');
        return true;
      } catch (err) {
        notify(err.message || '供应商切换失败', 'danger');
        return false;
      } finally {
        markPending(model.id, false);
      }
    },
    [canWrite, commitModels, markPending, notify]
  );

  const reload = useCallback(
    async ({ hard = false } = {}) => {
      if (hard) {
        setLoading(true);
        setSnapshot((prev) => ({ ...prev, models: [] }));
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const res = await fetch('/api/admin/models', { cache: 'no-store' });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || `加载失败 (HTTP ${res.status})`);
        setSnapshot(payload.data);
      } catch (err) {
        setError(err.message || '模型数据加载失败');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  /**
   * 单行改接：整行状态由服务端回读，但统计卡与筛选项是全模型派生值——
   * 改接会改变备用渠道数、异常路由与供应商计数，所以成功后要再拉一次快照。
   */
  const handleSwitchProvider = useCallback(
    async (model, channel, options) => {
      const ok = await applyProviderSwitch(model, channel, options);
      if (ok) await reload();
      return ok;
    },
    [applyProviderSwitch, reload]
  );

  const handleToggleActive = useCallback(
    (model) => {
      if (!canWrite || pending.has(model.id)) return;
      if (!model.isActive) {
        applyPatch(model, { is_active: true }, { message: `${model.name} 已上线` });
        return;
      }
      setConfirmation({
        title: `确认下线 ${model.name}？`,
        description:
          '下线后 Studio 不再接受该模型的新请求，已在队列中的任务不受影响。该动作会以中风险写入审计日志。',
        confirmLabel: '确认下线',
        run: async () => {
          const ok = await applyPatch(model, { is_active: false }, { message: `${model.name} 已下线` });
          if (ok) setDetailId(null);
        },
      });
    },
    [applyPatch, canWrite, pending]
  );

  const handleTestRoute = useCallback(
    async (model) => {
      if (!canWrite || pending.has(model.id)) return;
      const routes = model.routes || [];
      const channel = routes.find((r) => r.enabled && r.providerEnabled) || routes[0];
      if (!channel) {
        notify('该模型尚未挂载供应商渠道，无法探测', 'danger');
        return;
      }
      markPending(model.id, true);
      try {
        const res = await fetch('/api/admin/models/routing/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.id }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || `渠道探测失败 (HTTP ${res.status})`);
        // 探测结论已经写进后端，行上的健康度与延迟必须回读，不能只弹一句提示。
        const feedback = probeFeedback(payload.data);
        await reload();
        notify(`${channel.providerName || channel.providerId}：${feedback.text}`, feedback.tone);
      } catch (err) {
        notify(err.message || '渠道探测请求失败', 'danger');
      } finally {
        markPending(model.id, false);
      }
    },
    [canWrite, markPending, notify, pending, reload]
  );

  /**
   * 模型级探测：把该模型挂载的所有可服务渠道各打一次探针。
   * 汇总数字用服务端返回的 summary，前端不再自己数 healthy/degraded ——
   * 那是第二份判定口径，会和熔断监控页对不上。
   */
  const handleProbeModelRoutes = useCallback(
    async (model) => {
      if (!canWrite || pending.has(model.id)) return;
      markPending(model.id, true);
      try {
        const res = await fetch(`/api/admin/models/${encodeURIComponent(model.id)}/health`, {
          method: 'POST',
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error?.message || `渠道探测失败 (HTTP ${res.status})`);
        const { summary, skippedDisabled = 0 } = payload.data || {};
        await reload();
        notify(
          `探测 ${summary.probed} 条渠道：健康 ${summary.healthy} · 待处理 ${summary.degraded} · 故障 ${summary.unhealthy}` +
            `${summary.credentialOnly ? `（其中 ${summary.credentialOnly} 条仅校验凭据）` : ''}` +
            `${skippedDisabled ? ` · 另有 ${skippedDisabled} 条停用未探测` : ''}`,
          summary.unhealthy > 0 ? 'danger' : summary.degraded > 0 ? 'warning' : 'success'
        );
      } catch (err) {
        notify(err.message || '渠道探测请求失败', 'danger');
      } finally {
        markPending(model.id, false);
      }
    },
    [canWrite, markPending, notify, pending, reload]
  );

  const handleSync = useCallback(async () => {
    if (!canWrite) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/models/catalog/sync', { method: 'POST' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error?.message || `目录同步失败 (HTTP ${res.status})`);
      const { models: addedModels = 0, channels = 0, routingPolicies = 0 } = payload.data || {};
      await reload();
      notify(
        `统一目录同步完成：模型 +${addedModels} · 渠道 +${channels} · 路由策略 +${routingPolicies}`,
        'success'
      );
    } catch (err) {
      notify(err.message || '模型目录同步失败', 'danger');
    } finally {
      setSyncing(false);
    }
  }, [canWrite, notify, reload]);

  const setFacet = useCallback((group, values) => {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, [group]: values } }));
  }, []);

  const toggleFacetValue = useCallback((group, value) => {
    setState((prev) => {
      const current = prev.filters[group] || [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, filters: { ...prev.filters, [group]: next } };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({ ...prev, filters: parseViewState().filters }));
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const everySelected = visible.length > 0 && visible.every((model) => prev.has(model.id));
      if (everySelected) {
        const next = new Set(prev);
        visible.forEach((model) => next.delete(model.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((model) => next.add(model.id));
      return next;
    });
  }, [visible]);

  const runBulk = useCallback(
    async ({ action, credits, markup, provider }) => {
      const targets = models.filter((model) => selected.has(model.id));
      if (!targets.length) return;
      setBulk({ done: 0, total: targets.length });
      let ok = 0;
      let failed = 0;
      const skipped = [];
      for (const model of targets) {
        let updates = null;
        let channel = null;
        if (action === 'online') {
          if (model.isActive) continue;
          updates = { is_active: true };
        } else if (action === 'offline') {
          if (!model.isActive) continue;
          updates = { is_active: false };
        } else if (action === 'credits') {
          updates = { credits_price: Math.round(Number(credits)) };
        } else if (action === 'markup') {
          updates = {
            credits_price: creditsFromMarkup({
              providerCostUsd: model.providerCostUsd,
              markup,
              creditUsdRate: rate,
            }),
          };
        } else if (action === 'provider') {
          // 批量改接必须写真实路由：models_config.provider 只是展示列，
          // 生成链路选的是 provider_models 上钉选的渠道，只改前者不会换掉实际供应商。
          channel = (model.routes || []).find(
            (route) => (route.providerSlug || route.providerId) === provider && route.usable
          );
          if (!channel) {
            failed += 1;
            skipped.push(`${model.name}：没有 ${provider} 的可用渠道`);
            continue;
          }
        }
        if (!updates && !channel) {
          failed += 1;
          continue;
        }
        // 只有改价分支需要校验 Credits：把这条判断套到上下线上会把 is_active 请求判成非法值。
        if (updates && 'credits_price' in updates
          && (updates.credits_price === null || !Number.isFinite(Number(updates.credits_price)))) {
          failed += 1;
          skipped.push(`${model.name}：没有成本可换算，需要已知官方成本`);
          continue;
        }
        const success = channel
          ? await applyProviderSwitch(model, channel)
          : await applyPatch(model, updates);
        if (success) ok += 1;
        else failed += 1;
        setBulk((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setBulk(null);
      setSelected(new Set());
      // 批量改价/改接同样会挪动统计卡与筛选项的计数，循环结束后统一回读一次快照。
      if (ok) await reload();
      notify(
        `批量操作完成：成功 ${ok} 个${failed ? ` · 失败/跳过 ${failed} 个` : ''}${
          skipped.length ? `（${skipped.slice(0, 2).join('；')}${skipped.length > 2 ? ' 等' : ''}）` : ''
        }`,
        failed ? 'warning' : 'success'
      );
    },
    [applyPatch, applyProviderSwitch, models, notify, rate, reload, selected]
  );

  const requestBulkOffline = useCallback(() => {
    const count = models.filter((model) => selected.has(model.id) && model.isActive).length;
    if (!count) {
      notify('选中的模型都已处于下线状态', 'warning');
      return;
    }
    setConfirmation({
      title: `确认批量下线 ${count} 个模型？`,
      description:
        '下线后 Studio 不再接受这些模型的新请求，已在队列中的任务不受影响。该动作会以中风险逐条写入审计日志。',
      confirmLabel: '确认批量下线',
      run: () => runBulk({ action: 'offline' }),
    });
  }, [models, notify, runBulk, selected]);

  const requestBulkProvider = useCallback(
    (provider) => {
      const targets = models.filter((model) => selected.has(model.id));
      const switchable = targets.filter((model) =>
        (model.routes || []).some(
          (route) => (route.providerSlug || route.providerId) === provider && route.usable
        )
      );
      if (!switchable.length) {
        notify(`选中的模型里没有 ${provider} 的可用渠道`, 'warning');
        return;
      }
      const blocked = targets.length - switchable.length;
      setConfirmation({
        title: `确认把 ${switchable.length} 个模型改接到 ${provider}？`,
        description: blocked
          ? `另外 ${blocked} 个模型没有该供应商的可用渠道，将保持原供应商不变。改接写入 provider_models 的主选渠道，运行时立即生效，并以高风险逐条写入审计日志。`
          : '改接写入 provider_models 的主选渠道，运行时立即生效，并以高风险逐条写入审计日志。',
        confirmLabel: '确认改接供应商',
        run: () => runBulk({ action: 'provider', provider }),
      });
    },
    [models, notify, runBulk, selected]
  );

  const handleBulkApply = useCallback(
    (payload) => {
      if (payload.action === 'offline') {
        requestBulkOffline();
        return;
      }
      if (payload.action === 'provider') {
        requestBulkProvider(payload.provider);
        return;
      }
      runBulk(payload);
    },
    [requestBulkOffline, requestBulkProvider, runBulk]
  );

  const savePricing = useCallback(
    async (model, updates) => {
      const ok = await applyPatch(model, updates, { message: `${model.name} 定价与接入配置已保存` });
      if (ok) setPricingId(null);
    },
    [applyPatch]
  );

  const allSelected = visible.length > 0 && visible.every((model) => selected.has(model.id));
  const someSelected = !allSelected && visible.some((model) => selected.has(model.id));
  const busy = refreshing || loading || syncing || Boolean(bulk);

  const filterProps = {
    facets,
    filters: state.filters,
    onToggleValue: toggleFacetValue,
    onClearFilters: clearFilters,
  };

  const sharedViewProps = {
    models: visible,
    creditUsdRate: rate,
    canWrite,
    pendingIds: pending,
    selectedIds: selected,
    onOpenDetail: (model) => setDetailId(model.id),
    onConfigure: (model) => setPricingId(model.id),
    onToggleActive: handleToggleActive,
    onTestRoute: handleTestRoute,
    onSwitchProvider: handleSwitchProvider,
    onToggleSelect: toggleSelect,
  };

  return (
    <div>
      <ModelHeader
        canWrite={canWrite}
        creditValuation={creditValuation}
        refreshing={busy}
        syncing={syncing}
        onRefresh={() => reload()}
        onSync={handleSync}
      />
      <ModelStats stats={stats} />

      <div className="flex items-start gap-4">
        <ModelFilterSidebar {...filterProps} />

        <div className="min-w-0 flex-1">
          <ModelToolbar
            query={state.filters.q}
            filters={state.filters}
            facets={facets}
            sort={state.sort}
            view={state.view}
            busy={busy}
            resultCount={visible.length}
            totalCount={models.length}
            onQueryChange={(q) =>
              setState((prev) => ({ ...prev, filters: { ...prev.filters, q } }))
            }
            onFacetChange={setFacet}
            onSortChange={(sort) => setState((prev) => ({ ...prev, sort }))}
            onViewChange={(view) => setState((prev) => ({ ...prev, view }))}
            onRefresh={() => reload()}
            onOpenFilters={() => setFiltersOpen(true)}
          />

          {error && !loading && (
            <ModelErrorState
              message={`${error}（当前展示的是上一次成功加载的数据）`}
              onRetry={() => reload({ hard: true })}
            />
          )}
          {error && loading && (
            <p className="mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-danger">
              {error}
            </p>
          )}

          {loading ? (
            <ModelSkeletonGrid />
          ) : !visible.length ? (
            <ModelEmptyState filters={state.filters} onClearFilters={clearFilters} />
          ) : state.view === 'grid' ? (
            <ModelGrid {...sharedViewProps} />
          ) : (
            <ModelList
              {...sharedViewProps}
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleSelectAll={selectAllVisible}
            />
          )}
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        providers={facets.providers}
        busy={Boolean(bulk)}
        progress={bulk}
        onApply={handleBulkApply}
        onClear={() => setSelected(new Set())}
      />

      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent title="筛选模型" side="right">
          <ModelFilterGroupsInline {...filterProps} onDone={() => setFiltersOpen(false)} />
        </DrawerContent>
      </Drawer>

      <ModelDetailDrawer
        model={detailModel}
        creditUsdRate={rate}
        canWrite={canWrite}
        pending={detailModel ? pending.has(detailModel.id) : false}
        onClose={() => setDetailId(null)}
        onConfigure={(model) => setPricingId(model.id)}
        onToggleActive={handleToggleActive}
        onTestRoute={handleTestRoute}
        onProbeAllRoutes={handleProbeModelRoutes}
        onSwitchProvider={handleSwitchProvider}
      />

      <ModelPricingModal
        model={pricingModel}
        creditUsdRate={rate}
        creditValuation={creditValuation}
        providers={facets.providers}
        busy={pricingModel ? pending.has(pricingModel.id) : false}
        onClose={() => setPricingId(null)}
        onSubmit={savePricing}
      />

      <ConfirmActionDialog
        isOpen={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          await confirmation?.run();
        }}
        title={confirmation?.title}
        description={confirmation?.description}
        confirmLabel={confirmation?.confirmLabel}
        tone="danger"
      />

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-6 right-6 z-toast max-w-sm rounded-lg border px-3.5 py-2.5 text-body-sm shadow-elevation-3 animate-fade-in',
            toast.tone === 'danger'
              ? 'border-danger-line bg-danger-soft text-danger'
              : toast.tone === 'warning'
                ? 'border-warning-line bg-warning-soft text-warning'
                : 'border-success-line bg-success-soft text-success'
          )}
        >
          <span className="flex items-start gap-2">
            {toast.tone === 'danger' ? (
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            )}
            <span>{toast.text}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function ModelFilterGroupsInline({ onDone, ...props }) {
  return (
    <div>
      <ModelFilterGroups {...props} />
      <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onDone}>
        收起筛选
      </Button>
    </div>
  );
}
