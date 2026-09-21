'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from 'studio/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'studio/ui/overlay';
import { cn } from '@/lib/utils';
import { LayoutGrid, List, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import {
  CHANNEL_LABELS,
  ROUTE_STATE_LABELS,
  SORT_OPTIONS,
  STATUS_LABELS,
  typeLabel,
} from '@/lib/modelCenter/view';

const ALL = '__all__';

const GROUP_LABEL = {
  types: '全部类型',
  providers: '全部供应商',
  statuses: '全部状态',
  channels: '全部渠道',
  routeStates: '全部路由',
};

const LABEL_FN = {
  types: typeLabel,
  providers: (value) => value,
  statuses: (value) => STATUS_LABELS[value] || value,
  channels: (value) => CHANNEL_LABELS[value] || value,
  routeStates: (value) => ROUTE_STATE_LABELS[value] || value,
};

function FacetSelect({ group, values, options, onChange }) {
  const single = values.length === 1 ? values[0] : '';
  return (
    <div className="w-[136px] shrink-0">
      <Select value={single || ALL} onValueChange={(next) => onChange(group, next === ALL ? [] : [next])}>
        <SelectTrigger
          size="sm"
          aria-label={GROUP_LABEL[group]}
          className={cn(values.length > 1 && 'border-brand text-brand')}
        >
          <SelectValue>
            {values.length > 1
              ? `已选 ${values.length} 项`
              : single
                ? LABEL_FN[group](single)
                : GROUP_LABEL[group]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{GROUP_LABEL[group]}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {LABEL_FN[group](option.value)} · {option.count}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ModelToolbar({
  query,
  filters,
  facets,
  sort,
  view,
  busy,
  resultCount,
  totalCount,
  onQueryChange,
  onFacetChange,
  onSortChange,
  onViewChange,
  onRefresh,
  onOpenFilters,
}) {
  const [text, setText] = useState(query);
  const committed = useRef(query);

  useEffect(() => {
    if (query !== committed.current) {
      committed.current = query;
      setText(query);
    }
  }, [query]);

  useEffect(() => {
    if (text === committed.current) return undefined;
    const timer = setTimeout(() => {
      committed.current = text;
      onQueryChange(text.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [text, onQueryChange]);

  return (
    <div className="sticky top-0 z-sticky -mx-1 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-1 py-2">
      <div className="min-w-[240px] flex-1 basis-[280px]">
        <Input
          size="sm"
          icon={Search}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="搜索模型名称 / Model ID / 供应商 / 渠道"
          aria-label="搜索模型"
        />
      </div>

      {onOpenFilters && (
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5 xl:hidden"
          onClick={onOpenFilters}
        >
          <SlidersHorizontal className="size-3.5" />
          分组筛选
        </Button>
      )}

      {['types', 'providers', 'statuses', 'channels', 'routeStates'].map((group) => (
        <FacetSelect
          key={group}
          group={group}
          values={filters[group]}
          options={facets[group]}
          onChange={onFacetChange}
        />
      ))}

      <div className="w-[152px] shrink-0">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger size="sm" aria-label="排序方式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-caption tabular-nums text-ink-subtle min-[1280px]:inline">
          {resultCount} / {totalCount}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          disabled={busy}
          aria-label="刷新数据"
          title="刷新数据"
        >
          <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
        </Button>
        <div className="flex items-center gap-0.5 rounded-md border border-line bg-well p-0.5">
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-pressed={view === 'grid'}
            aria-label="卡片视图"
            onClick={() => onViewChange('grid')}
            title="卡片视图"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-pressed={view === 'list'}
            aria-label="列表视图"
            onClick={() => onViewChange('list')}
            title="列表视图"
          >
            <List className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
