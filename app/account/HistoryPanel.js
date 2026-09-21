'use client';

import { useEffect, useState } from 'react';

export default function HistoryPanel() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  const [studioFilter, setStudioFilter] = useState('all');

  useEffect(() => {
    fetch('/api/creations?limit=12', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('unauthorized')))
      .then((data) => { setItems(data.creations || []); setState('ready'); })
      .catch(() => setState('error'));
  }, []);

  const studios = [...new Set(items.map((item) => item.studio_id).filter(Boolean))];
  const visibleItems = studioFilter === 'all' ? items : items.filter((item) => item.studio_id === studioFilter);

  const removeItem = async (item) => {
    if (!window.confirm('确定删除这条作品记录吗？删除后无法恢复。')) return;
    const response = await fetch(`/api/creations?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (!response.ok) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-wash p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">最近生成</h2><p className="mt-1 text-xs text-ink-subtle">复用模板中的作品归档思路，记录保存在本站账户下。</p></div><div className="flex items-center gap-3"><label className="text-xs text-ink-subtle">Studio <select value={studioFilter} onChange={(event) => setStudioFilter(event.target.value)} className="ml-1 rounded-md border border-line bg-scrim px-2 py-1 text-xs text-ink"><option value="all">全部</option>{studios.map((studio) => <option key={studio} value={studio}>{studio}</option>)}</select></label><a href="/studio" className="text-xs font-semibold text-brand-hover hover:text-brand-hover">继续创作 →</a></div></div>
      {state === 'loading' && <p className="mt-5 text-sm text-ink-subtle">加载记录…</p>}
      {state === 'error' && <p className="mt-5 text-sm text-ink-subtle">暂时无法加载记录。</p>}
      {state === 'ready' && items.length === 0 && <p className="mt-5 text-sm text-ink-subtle">还没有生成记录。完成一次创作后会显示在这里。</p>}
      {state === 'ready' && items.length > 0 && visibleItems.length === 0 && <p className="mt-5 text-sm text-ink-subtle">该 Studio 暂无记录。</p>}
      {state === 'ready' && visibleItems.length > 0 && <div className="mt-4 divide-y divide-line">{visibleItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.label || item.studio_id}</p><p className="mt-1 text-xs text-ink-subtle">{new Date(item.created_at).toLocaleString()} · {item.studio_id} · {item.status === 'completed' ? '已完成' : item.status}</p></div><div className="flex shrink-0 items-center gap-3">{item.result_url ? <a className="text-xs font-semibold text-brand-hover hover:text-brand-hover" href={item.result_url} download target="_blank" rel="noreferrer">下载 / 打开</a> : <span className="text-xs text-ink-subtle">无结果链接</span>}<button type="button" className="text-xs text-danger hover:text-danger" onClick={() => removeItem(item)}>删除</button></div></div>)}</div>}
    </section>
  );
}
