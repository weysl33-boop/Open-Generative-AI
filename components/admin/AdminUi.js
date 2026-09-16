import { CopyableId, ConfirmActionDialog } from './AdminUiClient';

export { CopyableId, ConfirmActionDialog };

export function PageHeader({ eyebrow = 'KoyoSIM 运营后台', title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
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
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

export function StatusBadge({ children, tone = 'neutral' }) {
  const styles = {
    good: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
    warn: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
    danger: 'border-red-400/30 bg-red-400/10 text-red-200',
    info: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
    neutral: 'border-white/15 bg-white/5 text-white/60',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}

export function MetricCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-white/45">{label}</p>
      <p className={`mt-3 text-3xl font-extrabold tracking-tight ${tone === 'info' ? 'text-cyan-200' : 'text-white'}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-white/40">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ title = '暂无数据', description = '当前范围内还没有可显示的记录。' }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="mt-4 font-semibold text-white/80">{title}</p>
      <p className="mt-1.5 text-xs text-white/40">{description}</p>
    </div>
  );
}

export function DataTable({ columns, rows, empty = '暂无记录' }) {
  if (!rows?.length) return <EmptyState title={empty} />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-white/10 bg-black/40 text-xs text-white/45">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3.5 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row, index) => (
            <tr key={row.id || index} className="transition-colors hover:bg-white/[0.03]">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3.5 text-white/75">
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
        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100"
      >
        加载下一页
      </a>
    </div>
  );
}
