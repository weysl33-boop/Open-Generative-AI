import { Inbox } from 'lucide-react';
import { CopyableId, ConfirmActionDialog } from './AdminUiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export { CopyableId, ConfirmActionDialog, Badge, Button };

export function PageHeader({ eyebrow = 'KoyoSIM 运营后台', title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line-subtle pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-brand">
            {eyebrow}
          </p>
        )}
        <h1 className="text-page-title font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-body-sm leading-relaxed text-ink-muted">
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
    <section
      className={`rounded-xl border border-line-subtle bg-surface p-5 shadow-elevation-1 transition-[border-color,background-color,box-shadow] duration-fast hover:border-line ${className}`}
    >
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
    neutral: 'border-line-subtle bg-wash text-ink-muted',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-micro font-medium tracking-[0.01em] ${
        styles[tone] || styles.neutral
      }`}
    >
      {children}
    </span>
  );
}

export function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card className="relative overflow-hidden transition-[border-color,box-shadow] duration-fast hover:border-brand-line">
      <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          tone === 'info'
            ? 'text-brand'
            : tone === 'good'
            ? 'text-success'
            : tone === 'warn'
            ? 'text-warning'
            : tone === 'danger'
            ? 'text-danger'
            : 'text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-caption text-ink-subtle">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title = '暂无数据', description = '当前范围内还没有可显示的记录。' }) {
  return (
    <div className="rounded-xl border border-dashed border-line-subtle bg-well px-6 py-12 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-line-subtle bg-wash text-ink-muted">
        <Inbox className="size-5 text-brand" />
      </div>
      <p className="mt-4 text-card-title font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm mx-auto text-body-sm text-ink-muted">{description}</p>
    </div>
  );
}

export function DataTable({ columns, rows, data, empty = '暂无记录', emptyText }) {
  const tableRows = rows || data || [];
  const emptyTitle = emptyText || empty;
  if (!tableRows.length) return <EmptyState title={emptyTitle} />;

  return (
    <div className="overflow-x-auto scrollbar-rail rounded-xl border border-line-subtle bg-surface shadow-elevation-1">
      <table className="w-full min-w-[760px] text-left text-body-sm">
        <thead className="border-b border-line-subtle bg-well text-caption font-medium uppercase tracking-[0.04em] text-ink-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {tableRows.map((row, index) => (
            <tr key={row.id || index} className="transition-colors duration-fast hover:bg-wash">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-ink leading-normal">
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
        className="inline-flex h-control-md items-center rounded-md border border-line-subtle bg-raised px-4 text-body-sm font-medium text-ink transition-[background-color,border-color,color] duration-fast hover:border-brand-line hover:bg-brand-soft hover:text-brand"
      >
        加载下一页
      </a>
    </div>
  );
}
