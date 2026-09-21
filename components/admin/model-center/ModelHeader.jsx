import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { creditValuationSourceText, creditValuationText } from '@/lib/modelCenter/view';
import { RefreshCw, GitBranchPlus, Plus } from 'lucide-react';

export default function ModelHeader({ canWrite, creditValuation, refreshing, syncing, onRefresh, onSync }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-line-subtle pb-5">
      <div className="min-w-0">
        <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-brand">
          模型中枢与成本计费
        </p>
        <h1 className="flex items-center gap-2.5 text-page-title text-ink">
          模型开关与成本定价
          {!canWrite && <Badge variant="outline">只读权限</Badge>}
        </h1>
        <p className="mt-1.5 max-w-3xl text-body-sm leading-5 text-ink-muted">
          统一管理 Studio AI 模型、供应商路由、官方调用成本、Credits 消耗、用户售价以及模型上线状态。
        </p>
        {/* 页面上每一个美元数字都出自这个估值，来源不写出来就等于让它看起来像实测值。 */}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-caption text-ink-subtle">
          <span className="font-mono tabular-nums">{creditValuationText(creditValuation)}</span>
          <span
            className={cn(creditValuation?.source === 'invalid' && 'text-warning')}
          >
            · {creditValuationSourceText(creditValuation)}
          </span>
          <Link href="/admin/settings" className="text-brand underline-offset-2 hover:underline">
            调整口径
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canWrite && (
          <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing || refreshing}>
            <GitBranchPlus className={cn('size-3.5', syncing && 'animate-pulse')} />
            同步模型目录
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          刷新数据
        </Button>
        <Button asChild variant="primary" size="sm">
          <Link href="/admin/models/catalog">
            <Plus className="size-3.5" />
            添加模型
          </Link>
        </Button>
      </div>
    </header>
  );
}
