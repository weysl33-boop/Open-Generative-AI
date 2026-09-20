'use client';

import { useState, useMemo } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Layers, Plus, Search, Sparkles, Film, Image as ImageIcon, Music, Edit3, Loader2 } from 'lucide-react';

export default function CatalogManagerClient({ initialModels = [] }) {
  const [models, setModels] = useState(initialModels);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingModel, setEditingModel] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-white/[0.04] text-gray-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              {cat === 'all' ? '全部模型' : cat === 'image' ? '图像类' : cat === 'video' ? '视频类' : '音频类'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索模型 ID 或显示名..."
              className="w-56 rounded-lg border border-white/[0.1] bg-white/[0.03] pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
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
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium text-xs py-1.5"
          >
            <Plus className="mr-1 size-3.5" />
            注册规范模型
          </Button>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0d0e12]/90 shadow-xl backdrop-blur-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.02] uppercase tracking-[0.06em] text-gray-400">
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
          <tbody className="divide-y divide-white/[0.06]">
            {filteredModels.map((m) => (
              <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-white">{m.id}</td>
                <td className="px-4 py-3 text-gray-200">
                  <div className="flex items-center gap-1.5">
                    {m.category === 'video' ? (
                      <Film className="size-3.5 text-cyan-400" />
                    ) : m.category === 'audio' ? (
                      <Music className="size-3.5 text-amber-400" />
                    ) : (
                      <ImageIcon className="size-3.5 text-emerald-400" />
                    )}
                    <span className="font-semibold">{m.display_name || m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-gray-400">{m.category}</td>
                <td className="px-4 py-3 font-mono text-gray-400">{m.sort}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={m.status === 'active' ? 'good' : 'neutral'}>
                    {m.status === 'active' ? '开放中' : '已下线'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  {m.is_featured ? (
                    <span className="inline-flex items-center text-amber-400 font-medium">
                      <Sparkles className="mr-0.5 size-3" /> 推荐
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleStatus(m)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {m.status === 'active' ? '下线' : '上线'}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setEditingModel(m);
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-white/[0.06] hover:text-cyan-400 transition-colors"
                    >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0d0e12] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {isCreating ? '注册新规范模型' : `编辑规范模型: ${editingModel.id}`}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              设置对外暴露的规范元数据。底层映射请前往「路由策略配置」维护。
            </p>

            <form onSubmit={handleSaveModel} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300">模型 ID (Canonical ID)</label>
                <input
                  name="id"
                  defaultValue={editingModel.id}
                  disabled={!isCreating}
                  required
                  placeholder="例如: kling-2.6-pro, flux-1.1-pro"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">内部系统名</label>
                  <input
                    name="name"
                    defaultValue={editingModel.name}
                    required
                    placeholder="例如: Kling 2.6 Pro"
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300">前台展示名 (Display Name)</label>
                  <input
                    name="displayName"
                    defaultValue={editingModel.display_name}
                    placeholder="前台展示名"
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300">业务类别</label>
                  <select
                    name="category"
                    defaultValue={editingModel.category || 'image'}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="image">图像 (Image)</option>
                    <option value="video">视频 (Video)</option>
                    <option value="audio">音频 (Audio)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300">排序权重</label>
                  <input
                    type="number"
                    name="sort"
                    defaultValue={editingModel.sort ?? 10}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300">状态</label>
                  <select
                    name="status"
                    defaultValue={editingModel.status || 'active'}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="active">Active (开放)</option>
                    <option value="disabled">Disabled (禁用)</option>
                    <option value="maintenance">Maintenance (维护)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300">描述</label>
                <textarea
                  name="description"
                  defaultValue={editingModel.description || ''}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  name="isFeatured"
                  id="isFeatured"
                  defaultChecked={Boolean(editingModel.is_featured)}
                  className="size-4 rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
                />
                <label htmlFor="isFeatured" className="text-xs text-gray-300 cursor-pointer">
                  标记为前台 Featured 推荐模型
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingModel(null);
                    setIsCreating(false);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
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
