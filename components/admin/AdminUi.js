import { Inbox } from 'lucide-react';
import { CopyableId, ConfirmActionDialog } from './AdminUiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export { CopyableId, ConfirmActionDialog, Badge, Button };

export function PageHeader({ eyebrow = 'KoyoSIM 运营后台', title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-8 sm:text-3xl sm:leading-9 text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 tracking-[-0.005em] text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}
export function Card({ children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-base/90 p-5 shadow-elevation-3 shadow-black/40 backdrop-blur-md transition-all duration-base ease-out hover:border-line-strong ${className}`}>
      {children}
    </section>
  );
}
export function StatusBadge({ children, tone = 'neutral' }) {
  const styles = {
    good: 'border-success-line bg-success-soft text-success',
    warn: 'border-warning-line bg-warning-soft text-warning',
    danger: 'border-danger-line bg-danger-soft text-danger',
    info: 'border-brand-line bg-brand-soft text-brand',
    neutral: 'border-line bg-wash text-ink-muted',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-[0.01em] leading-4 ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}
export function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card className="p-5 relative overflow-hidden group hover:border-brand-line hover:shadow-brand-soft transition-all duration-base">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
      <p className={`mt-2.5 text-3xl font-bold tracking-[-0.025em] leading-9 tabular-nums ${tone === 'info' ? 'text-brand' : tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-5 tracking-[0.01em] text-ink-muted">{hint}</p>}
    </Card>
  );
}
export function EmptyState({ title = '暂无数据', description = '当前范围内还没有可显示的记录。' }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-base/60 px-6 py-12 text-center backdrop-blur-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-wash text-ink-muted">
        <Inbox className="size-6 text-brand" />
      </div>
      <p className="mt-4 font-semibold text-ink text-sm tracking-[-0.01em] leading-5">{title}</p>
      <p className="mt-1 text-xs text-ink-muted max-w-sm mx-auto leading-5 tracking-[-0.005em]">{description}</p>
    </div>
  );
}
export function DataTable({ columns, rows, empty = '暂无记录' }) {
  if (!rows?.length) return <EmptyState title={empty} />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-base/90 shadow-elevation-3 shadow-black/40 backdrop-blur-md scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-line bg-wash text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3.5">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {rows.map((row, index) => (
            <tr key={row.id || index} className="transition-colors duration-fast hover:bg-wash">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3.5 text-ink text-xs leading-5 tracking-[-0.005em]">
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, searchParams }) {
  if (!meta?.hasMore) return null;
  const params = new URLSearchParams(searchParams);
  params.set('cursor', meta.nextCursor);

  return (
    <div className="mt-5 flex justify-end">
      <a
        href={`?${params.toString()}`}
        className="inline-flex h-[38px] items-center rounded-lg border border-line bg-wash-strong px-4 text-xs font-medium text-ink tracking-[-0.005em] transition-all duration-base hover:border-brand-ring hover:bg-brand-soft hover:text-brand active:scale-[0.98]"
      >
        加载下一页
      </a>
    </div>
  );
}
