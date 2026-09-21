'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

// 单价的唯一事实来源是 models_config.credits_price：线上报价走 QUOTE_SOURCES.PARITY，
// 这里读到的数额与生成时实际冻结的数额是同一个，不能再维护第二份手工价目表。
const TYPE_ORDER = ['video', 'image', 'audio', 'lipsync', 'recast', 'motion-control'];
const TYPE_META = {
  video: { label: '视频生成', unit: '条' },
  image: { label: '图片生成', unit: '张' },
  audio: { label: '音频生成', unit: '段' },
  lipsync: { label: '对口型', unit: '次' },
  recast: { label: '角色替换', unit: '次' },
  'motion-control': { label: '动作控制', unit: '次' },
};
const PAGE_SIZE = 40;

function typeMeta(type) {
  return TYPE_META[type] || { label: type, unit: '次' };
}

function formatPrice(row) {
  const unit = typeMeta(row.type).unit;
  if (row.min === row.max) return `${row.min} 积分/${unit}`;
  return `${row.min}–${row.max} 积分/${unit}`;
}

export default function PriceDetailsTab() {
  const [models, setModels] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeType, setActiveType] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    setModels(null);
    setFailed(false);
    fetch('/api/models/active', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('模型目录请求失败');
        const data = await response.json();
        if (!Array.isArray(data?.models)) throw new Error('模型目录格式异常');
        setModels(data.models);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, [retry]);

  const { rows, typeList } = useMemo(() => {
    if (!models) return { rows: [], typeList: [] };
    const groups = new Map();
    for (const model of models) {
      const price = Number(model.creditsPrice);
      const name = String(model.name || model.id || '').trim();
      if (!name || !Number.isFinite(price)) continue;
      const key = `${model.type}::${name}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { type: model.type, name, min: price, max: price });
      } else {
        existing.min = Math.min(existing.min, price);
        existing.max = Math.max(existing.max, price);
      }
    }
    const list = [...groups.values()];
    // 表格默认序必须和分类药丸同一套排序，否则「全部」视图先出现图片组、
    // 药丸却把视频组排在前面，读者会以为筛选项和列表对不上。
    const typeRank = (type) => {
      const index = TYPE_ORDER.indexOf(type);
      return index === -1 ? TYPE_ORDER.length : index;
    };
    list.sort((a, b) => {
      if (a.type !== b.type) return typeRank(a.type) - typeRank(b.type);
      if (a.min !== b.min) return a.min - b.min;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    const buckets = new Map();
    for (const row of list) {
      const bucket = buckets.get(row.type) || { type: row.type, count: 0, min: row.min };
      bucket.count += 1;
      bucket.min = Math.min(bucket.min, row.min);
      buckets.set(row.type, bucket);
    }
    const types = [...buckets.values()].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.min - b.min;
    });
    return { rows: list, typeList: types };
  }, [models]);

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeType !== 'all' && row.type !== activeType) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || typeMeta(row.type).label.includes(needle);
    });
  }, [rows, activeType, keyword]);

  const switchType = useCallback((type) => {
    setActiveType(type);
    setLimit(PAGE_SIZE);
  }, []);

  const headerCell = 'border-b border-line px-3 py-2.5 text-label font-bold text-ink bg-overlay text-start first:pl-4 last:pr-4';
  const bodyCell = 'border-b border-line-subtle px-3 py-2.5 text-label text-ink first:pl-4 last:pr-4';

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-page-title font-bold tracking-tight text-ink">模型价格表</h3>
        <p className="text-label text-ink-muted">
          单价与生成时的实际扣费同源，按每次成功出片出图计。生成失败或内容被拦截时，本次冻结的积分原路退回。
        </p>
      </div>

      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-well p-4">
          <p className="text-label text-ink">价格表暂时读取失败，可能是网络波动。</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
            重新加载
          </Button>
        </div>
      )}

      {!failed && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => switchType('all')}
              className={`rounded-full border px-3 py-1.5 text-label font-medium transition-colors cursor-pointer ${
                activeType === 'all'
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-well text-ink-muted hover:text-ink'
              }`}
            >
              全部 {models ? `· ${rows.length}` : ''}
            </button>
            {typeList.map((bucket) => (
              <button
                key={bucket.type}
                type="button"
                onClick={() => switchType(bucket.type)}
                className={`rounded-full border px-3 py-1.5 text-label font-medium transition-colors cursor-pointer ${
                  activeType === bucket.type
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-well text-ink-muted hover:text-ink'
                }`}
              >
                {typeMeta(bucket.type).label} · {bucket.count} · {bucket.min} 积分/
                {typeMeta(bucket.type).unit}起
              </button>
            ))}
          </div>

          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="搜索模型名称"
              aria-label="搜索模型名称"
              className="pl-9"
            />
          </div>

          <div className="w-full overflow-hidden rounded-xl border border-line-subtle bg-raised">
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={headerCell}>模型</th>
                    <th className={headerCell}>分类</th>
                    <th className={`${headerCell} text-end`}>单价</th>
                  </tr>
                </thead>
                <tbody>
                  {!models &&
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`skeleton-${index}`}>
                        <td className={bodyCell}>
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className={bodyCell}>
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className={`${bodyCell} text-end`}>
                          <Skeleton className="ml-auto h-4 w-20" />
                        </td>
                      </tr>
                    ))}

                  {models && filtered.slice(0, limit).map((row) => (
                    <tr key={`${row.type}-${row.name}`} className="transition-colors hover:bg-wash">
                      <td className={`${bodyCell} font-medium`}>{row.name}</td>
                      <td className={`${bodyCell} text-ink-muted`}>{typeMeta(row.type).label}</td>
                      <td className={`${bodyCell} text-end font-mono tabular-nums`}>{formatPrice(row)}</td>
                    </tr>
                  ))}

                  {models && filtered.length === 0 && (
                    <tr>
                      <td colSpan={3} className={`${bodyCell} py-8 text-center text-ink-muted`}>
                        没有匹配的模型，换个关键词试试。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length > limit && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-ink-muted">
                已显示 {limit} / {filtered.length} 个模型
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                显示更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
