'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Layers, Plus, Search, Sparkles, Film, Image as ImageIcon, Music, Edit3, Loader2 } from 'lucide-react';

export default function CatalogManagerClient({ initialModels = [] }) {
  const [models, setModels] = useState(initialModels);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingModel, setEditingModel] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  // 统计数据
  const imageCount = useMemo(() => models.filter((m) => m.category === 'image').length, [models]);
  const videoCount = useMemo(() => models.filter((m) => m.category === 'video').length, [models]);
  const audioCount = useMemo(() => models.filter((m) => m.category === 'audio').length, [models]);

  // 筛选列表
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchCat = selectedCategory === 'all' || m.category === selectedCategory;
      const kw = searchKeyword.toLowerCase();
      const matchKw = !kw || m.id.toLowerCase().includes(kw) || (m.display_name && m.display_name.toLowerCase().includes(kw));
      return matchCat && matchKw;
    });
  }, [models, selectedCategory, searchKeyword]);

  const handleSaveModel = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const form = e.target;
    const payload = {
      id: form.id.value.trim().toLowerCase(),
      name: form.name.value.trim(),
      display_name: form.displayName.value.trim() || form.name.value.trim(),
      category: form.category.value,
      description: form.description.value.trim(),
      status: form.status.value,
      sort: Number(form.sort.value || 0),
      is_featured: form.isFeatured.checked,
    };

    try {
      const res = await fetch('/api/admin/models/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const saved = data.data.model;
        setModels((prev) => {
          const idx = prev.findIndex((m) => m.id === saved.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...saved };
            return next;
          }
          return [saved, ...prev];
        });
        setEditingModel(null);
        setIsCreating(false);
      } else {
        alert(data.error?.message || '保存模型目录失败');
      }
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (model) => {
    const nextStatus = model.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch('/api/admin/models/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...model,
          status: nextStatus,
        }),
      });
      if (res.ok) {
        setModels((prev) =>
          prev.map((m) => (m.id === model.id ? { ...m, status: nextStatus } : m))
        );
      }
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleSyncLegacy = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/admin/models/catalog/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert('同步失败: ' + (data?.error?.message || res.status));
        return;
      }
      const payload = data.data || {};
      alert(
        `老目录对账完成\n新增规范模型 ${payload.models ?? 0} 个\n新增聚合渠道 ${payload.channels ?? 0} 条\n新增路由策略 ${payload.routingPolicies ?? 0} 条\n` +
        `待补定价 ${payload.gaps?.model_without_pricing ?? 0} 个`
      );
      router.refresh();
    } catch (err) {
      alert('同步失败: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部指标卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="规范模型总数" value={models.length} hint="面向创作者统一暴露" tone="info" />
        <MetricCard label="图像大模型" value={imageCount} hint="文生图 / 图像编辑" tone="neutral" />
        <MetricCard label="视频大模型" value={videoCount} hint="文生视频 / 图生视频" tone="good" />
        <MetricCard label="音频 / 音乐" value={audioCount} hint="音乐生成 / 语音合成" tone="neutral" />
      </div>

      {/* 过滤与搜索栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['all', 'image', 'video', 'audio'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-brand-pressed text-brand border border-brand-line'
                  : 'bg-wash text-ink-muted hover:text-ink border border-line-subtle'
              }`}
            >
              {cat === 'all' ? '全部模型' : cat === 'image' ? '图像类' : cat === 'video' ? '视频类' : '音频类'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSyncLegacy}
            disabled={isSyncing}
            className="border border-line bg-wash text-xs py-1.5 text-ink hover:text-ink"
          >
            {isSyncing ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Layers className="mr-1 size-3.5" />}
            对账老目录
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索模型 ID 或显示名..."
              className="w-56 rounded-lg border border-line bg-wash pl-9 pr-3 py-1.5 text-xs text-ink placeholder-ink-subtle focus:border-brand"
            />
          </div>
          <Button
            onClick={() => {
              setIsCreating(true);
              setEditingModel({
                id: '',
                name: '',
                display_name: '',
                category: 'image',
                description: '',
                status: 'active',
                sort: 10,
                is_featured: false,
              });
            }}
            className="bg-brand-active hover:bg-brand text-ink-on-accent font-medium text-xs py-1.5"
          >
            <Plus className="mr-1 size-3.5" />
            注册规范模型
          </Button>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-base/90 shadow-elevation-3 backdrop-blur-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-wash uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-4 py-3.5">模型标识 / 规范 ID</th>
              <th className="px-4 py-3.5">前台显示名</th>
              <th className="px-4 py-3.5">业务分类</th>
              <th className="px-4 py-3.5">排序权重</th>
              <th className="px-4 py-3.5">状态</th>
              <th className="px-4 py-3.5">推荐标</th>
              <th className="px-4 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {filteredModels.map((m) => (
              <tr key={m.id} className="hover:bg-wash transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-ink">{m.id}</td>
                <td className="px-4 py-3 text-ink">
                  <div className="flex items-center gap-1.5">
                    {m.category === 'video' ? (
                      <Film className="size-3.5 text-brand" />
                    ) : m.category === 'audio' ? (
                      <Music className="size-3.5 text-warning" />
                    ) : (
                      <ImageIcon className="size-3.5 text-success" />
                    )}
                    <span className="font-semibold">{m.display_name || m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-ink-muted">{m.category}</td>
                <td className="px-4 py-3 font-mono text-ink-muted">{m.sort}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={m.status === 'active' ? 'good' : 'neutral'}>
                    {m.status === 'active' ? '开放中' : '已下线'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  {m.is_featured ? (
                    <span className="inline-flex items-center text-warning font-medium">
                      <Sparkles className="mr-0.5 size-3" /> 推荐
                    </span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleStatus(m)}
                      className="text-xs text-ink-muted hover:text-ink transition-colors"
                    >
                      {m.status === 'active' ? '下线' : '上线'}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setEditingModel(m);
                      }}
                      className="rounded p-1 text-ink-muted hover:bg-wash-strong hover:text-brand transition-colors"
                      aria-label="编辑">
                      <Edit3 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 编辑/新增弹窗 */}
      {editingModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-base p-6 shadow-elevation-4">
            <h3 className="text-lg font-bold text-ink">
              {isCreating ? '注册新规范模型' : `编辑规范模型: ${editingModel.id}`}
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              设置对外暴露的规范元数据。底层映射请前往「路由策略配置」维护。
            </p>

            <form onSubmit={handleSaveModel} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink">模型 ID (Canonical ID)</label>
                <input
                  name="id"
                  defaultValue={editingModel.id}
                  disabled={!isCreating}
                  required
                  placeholder="例如: kling-2.6-pro, flux-1.1-pro"
                  className="mt-1.5 w-full rounded-lg border border-line bg-wash px-3 py-2 text-sm text-ink focus:border-brand disabled:opacity-50 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ink">内部系统名</label>
                  <input
                    name="name"
                    defaultValue={editingModel.name}
                    required
                    placeholder="例如: Kling 2.6 Pro"
                    className="mt-1.5 w-full rounded-lg border border-line bg-wash px-3 py-2 text-sm text-ink focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink">前台展示名 (Display Name)</label>
                  <input
                    name="displayName"
                    defaultValue={editingModel.display_name}
                    placeholder="前台展示名"
                    className="mt-1.5 w-full rounded-lg border border-line bg-wash px-3 py-2 text-sm text-ink focus:border-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink">业务类别</label>
                  <select
                    name="category"
                    defaultValue={editingModel.category || 'image'}
                    className="mt-1.5 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-brand"
                  >
                    <option value="image">图像 (Image)</option>
                    <option value="video">视频 (Video)</option>
                    <option value="audio">音频 (Audio)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink">排序权重</label>
                  <input
                    type="number"
                    name="sort"
                    defaultValue={editingModel.sort ?? 10}
                    className="mt-1.5 w-full rounded-lg border border-line bg-wash px-3 py-2 text-sm text-ink focus:border-brand font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink">状态</label>
                  <select
                    name="status"
                    defaultValue={editingModel.status || 'active'}
                    className="mt-1.5 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-brand"
                  >
                    <option value="active">Active (开放)</option>
                    <option value="disabled">Disabled (禁用)</option>
                    <option value="maintenance">Maintenance (维护)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink">描述</label>
                <textarea
                  name="description"
                  defaultValue={editingModel.description || ''}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-line bg-wash px-3 py-2 text-sm text-ink focus:border-brand"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  name="isFeatured"
                  id="isFeatured"
                  defaultChecked={Boolean(editingModel.is_featured)}
                  className="size-4 rounded border-line-strong bg-wash text-brand-active focus:ring-0"
                />
                <label htmlFor="isFeatured" className="text-xs text-ink cursor-pointer">
                  标记为前台 Featured 推荐模型
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingModel(null);
                    setIsCreating(false);
                  }}
                  className="text-ink-muted hover:text-ink"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-brand-active hover:bg-brand text-ink-on-accent font-semibold"
                >
                  {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  保存模型
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
