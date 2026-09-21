'use client';

import ModelCard from './ModelCard';
import { useWindowedList } from './useWindowedList';

export default function ModelGrid({
  models,
  creditUsdRate,
  canWrite,
  pendingIds,
  selectedIds,
  onOpenDetail,
  onConfigure,
  onToggleActive,
  onTestRoute,
  onSwitchProvider,
  onToggleSelect,
}) {
  const { limit, sentinelRef, revealMore } = useWindowedList(models.length, 48);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 min-[1024px]:grid-cols-2 min-[1600px]:grid-cols-3">
        {models.slice(0, limit).map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            creditUsdRate={creditUsdRate}
            canWrite={canWrite}
            pending={pendingIds.has(model.id)}
            selected={selectedIds.has(model.id)}
            onOpenDetail={() => onOpenDetail(model)}
            onConfigure={onConfigure}
            onToggleActive={onToggleActive}
            onTestRoute={onTestRoute}
            onSwitchProvider={onSwitchProvider}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {limit < models.length && (
        <div ref={sentinelRef} className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={revealMore}
            className="rounded-md border border-line bg-well px-4 py-1.5 text-body-sm text-ink-muted transition-colors duration-fast hover:border-line-strong hover:text-ink"
          >
            加载更多（剩余 {models.length - limit} 个）
          </button>
        </div>
      )}
    </div>
  );
}
