import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import {
  BILLING_MODE_LABELS,
  CHANNEL_LABELS,
  HEALTH_TEXT_CN,
  ROUTE_STATE_LABELS,
  STATUS_LABELS,
  hasActiveFilters,
  typeLabel,
} from '@/lib/modelCenter/view';
import { ISSUE_LABELS } from '@/lib/modelCenter/routing';

const GROUPS = [
  { key: 'statuses', title: '状态', labelFn: (v) => STATUS_LABELS[v] || v },
  { key: 'health', title: '健康状态', labelFn: (v) => HEALTH_TEXT_CN[v] || v },
  { key: 'types', title: '模型类型', labelFn: typeLabel },
  { key: 'providers', title: '模型厂商', labelFn: (v) => v },
  { key: 'channels', title: '调用渠道', labelFn: (v) => CHANNEL_LABELS[v] || v },
  { key: 'routeStates', title: '路由状态', labelFn: (v) => ROUTE_STATE_LABELS[v] || v },
  { key: 'issues', title: '待办问题', labelFn: (v) => ISSUE_LABELS[v] || v },
  { key: 'billing', title: '计费方式', labelFn: (v) => BILLING_MODE_LABELS[v] || v },
];

function FilterGroup({ title, options, selected, labelFn, onToggle }) {
  const [open, setOpen] = useState(true);
  if (!options.length) return null;

  return (
    <div className="border-b border-line-subtle py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-label text-ink-muted hover:text-ink"
      >
        <span className="font-semibold">{title}</span>
        <ChevronDown
          className={cn('size-3.5 text-ink-subtle transition-transform duration-fast', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-0.5">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-body-sm transition-colors duration-fast',
                  checked ? 'text-ink' : 'text-ink-muted hover:bg-wash hover:text-ink'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(option.value)}
                  className="size-3.5 shrink-0 cursor-pointer rounded-xs border-line bg-well accent-brand"
                />
                <span className="min-w-0 flex-1 truncate">{labelFn(option.value)}</span>
                <span className="shrink-0 font-mono text-caption tabular-nums text-ink-subtle">
                  {option.count}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ModelFilterGroups({ facets, filters, onToggleValue, onClearFilters }) {
  return (
    <div>
      <p className="pt-1 text-caption font-semibold uppercase tracking-[0.06em] text-ink-subtle">
        筛选
      </p>
      {GROUPS.map((group) => (
        <FilterGroup
          key={group.key}
          title={group.title}
          options={facets[group.key]}
          selected={filters[group.key] || []}
          labelFn={group.labelFn}
          onToggle={(value) => onToggleValue(group.key, value)}
        />
      ))}
      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={onClearFilters}>
          清除全部筛选
        </Button>
      )}
    </div>
  );
}

export function ModelFilterSidebar(props) {
  return (
    <aside className="hidden w-[232px] shrink-0 xl:block">
      <div className="sticky top-[60px] max-h-[calc(100vh-80px)] overflow-y-auto rounded-lg border border-line-subtle bg-surface px-3 py-1">
        <ModelFilterGroups {...props} />
      </div>
    </aside>
  );
}
