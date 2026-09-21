import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, SearchX } from 'lucide-react';
import { hasActiveFilters } from '@/lib/modelCenter/view';

export function ModelSkeletonGrid({ count = 9 }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 min-[1280px]:grid-cols-2 min-[1600px]:grid-cols-3"
      aria-busy="true"
      aria-label="模型加载中"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="mt-2 h-3 w-24" />
          <div className="mt-3 flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ModelEmptyState({ filters, onClearFilters }) {
  const filtered = hasActiveFilters(filters);
  return (
    <div className="rounded-lg border border-dashed border-line bg-well px-6 py-16 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-line bg-wash text-ink-subtle">
        {filtered ? <SearchX className="size-5" /> : <AlertTriangle className="size-5 text-warning" />}
      </div>
      <p className="mt-4 text-card-title text-ink">
        {filtered ? '没有找到符合条件的模型' : '模型目录为空'}
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-subtle">
        {filtered
          ? '尝试修改关键词，或清除供应商、模型类型、状态、渠道中的一项筛选条件。'
          : 'ai_studio.models_config 中还没有任何模型配置，请先执行模型目录迁移。'}
      </p>
      {filtered && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onClearFilters}>
          清除全部筛选
        </Button>
      )}
    </div>
  );
}

export function ModelErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-danger-line bg-danger-soft px-6 py-12 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-danger-line bg-overlay text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <p className="mt-4 text-card-title text-ink">模型数据加载失败</p>
      <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">
        {message || '网络异常或服务端返回错误，请重试。'}
      </p>
      <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
        重新加载
      </Button>
    </div>
  );
}
