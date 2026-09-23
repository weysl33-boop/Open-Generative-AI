'use client';

import React, { useState } from 'react';
import {
  HelpCircle,
  Plus,
  Save,
  RotateCcw,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Mail,
  FileText,
  Search,
  X,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  { value: 'all', label: '全部类别' },
  { value: 'quota', label: '算力与额度' },
  { value: 'subscription', label: '套餐与升降档' },
  { value: 'payment', label: '支付与开票' },
  { value: 'refund', label: '退款与售后' },
  { value: 'copyright', label: '版权与商用' },
  { value: 'legal', label: '协议与免责' },
  { value: 'general', label: '综合问答' },
];

export default function SubscriptionFaqManagerClient({ initialConfig, defaultConfig }) {
  const [config, setConfig] = useState(initialConfig || defaultConfig);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // 编辑弹窗状态
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 基础设置变更
  const handleMetaChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // 切换项启用状态
  const toggleItemEnabled = (id) => {
    setConfig((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)),
    }));
  };

  // 删除某一项
  const handleDeleteItem = (id) => {
    if (!window.confirm('确定要删除该问答项吗？删除后需点击上方“保存全部更改”才会正式持久化生效。')) {
      return;
    }
    setConfig((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== id),
    }));
  };

  // 上下移动排序
  const handleMoveOrder = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= config.items.length) return;

    const newItems = [...config.items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // 重新校准排序数值
    const reordered = newItems.map((item, idx) => ({ ...item, order: idx + 1 }));
    setConfig((prev) => ({ ...prev, items: reordered }));
  };

  // 打开编辑/新增
  const handleOpenEdit = (item = null) => {
    if (item) {
      setEditingItem({ ...item });
    } else {
      setEditingItem({
        id: `faq-${Date.now()}`,
        order: config.items.length + 1,
        enabled: true,
        category: 'general',
        question: '',
        answer: '',
      });
    }
    setIsModalOpen(true);
  };

  // 保存单个项编辑
  const handleSaveItemModal = (e) => {
    e.preventDefault();
    if (!editingItem.question.trim()) {
      alert('请填写常见问题标题');
      return;
    }

    setConfig((prev) => {
      const exists = prev.items.some((it) => it.id === editingItem.id);
      let updatedItems;
      if (exists) {
        updatedItems = prev.items.map((it) => (it.id === editingItem.id ? editingItem : it));
      } else {
        updatedItems = [...prev.items, editingItem];
      }
      return {
        ...prev,
        items: updatedItems.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
      };
    });

    setIsModalOpen(false);
    setEditingItem(null);
  };

  // 重置为官方预设
  const handleResetToDefaults = () => {
    if (!window.confirm('确认要一键恢复为官方完整 10 大标准预设问答吗？当前的自定义修改将被覆盖。')) {
      return;
    }
    setConfig(JSON.parse(JSON.stringify(defaultConfig)));
    setMessage({ type: 'success', text: '已恢复官方预设，请点击“保存更改”提交生效。' });
  };

  // 保存到服务端
  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const res = await fetch('/api/admin/subscription-faq', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '订阅说明与 QA 问答配置已成功保存并实时生效！' });
        if (data.config) setConfig(data.config);
      } else {
        setMessage({ type: 'error', text: data.error?.message || data.error || '保存失败，请检查填写内容' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '网络请求异常，保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  // 筛选问答
  const filteredItems = config.items.filter((item) => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchQuery =
      !searchQuery.trim() ||
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-base">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          eyebrow="计费与权益配置"
          title="订阅说明与 QA 问答管理"
          description="在线管理前台订阅浮层底部的 10 大问答规则、套餐升级退换货细则、开票指引及客服支持邮箱。"
        />

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            <span>恢复官方预设</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleOpenEdit(null)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            <span>新增问答项</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="gap-1.5"
          >
            <Save className="size-3.5" />
            <span>{isSaving ? '正在保存…' : '保存全部更改'}</span>
          </Button>
        </div>
      </div>

      {/* 提示消息 */}
      {message && (
        <div
          role="status"
          className={`flex items-center gap-2.5 p-3.5 rounded-lg border text-body-sm font-medium ${
            message.type === 'success'
              ? 'bg-success-soft border-success-line text-success'
              : 'bg-danger-soft border-danger-line text-danger'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 1. 全局订阅说明与客服配置卡片 */}
      <div className="rounded-xl border border-line-subtle bg-surface p-5 space-y-4 shadow-elevation-1">
        <h3 className="text-sm font-bold text-ink tracking-tight flex items-center gap-2">
          <Sparkles className="size-4 text-success" />
          <span>全局基础说明配置</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-ink-muted flex items-center gap-1.5">
              <FileText className="size-3.5 text-ink-subtle" />
              <span>顶部常驻提示语 (Notice)</span>
            </label>
            <input
              type="text"
              value={config.notice || ''}
              onChange={(e) => handleMetaChange('notice', e.target.value)}
              placeholder="例如：所有会员套餐均支持随时升级或取消..."
              className="w-full rounded-md border border-line-subtle bg-well px-3 py-2 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-ink-muted flex items-center gap-1.5">
              <Mail className="size-3.5 text-ink-subtle" />
              <span>官方客服与售后邮箱</span>
            </label>
            <input
              type="text"
              value={config.supportEmail || ''}
              onChange={(e) => handleMetaChange('supportEmail', e.target.value)}
              placeholder="support@koyosim.com"
              className="w-full rounded-md border border-line-subtle bg-well px-3 py-2 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-ink-muted flex items-center gap-1.5">
              <FileText className="size-3.5 text-ink-subtle" />
              <span>发票与凭证说明摘要</span>
            </label>
            <input
              type="text"
              value={config.invoiceNotice || ''}
              onChange={(e) => handleMetaChange('invoiceNotice', e.target.value)}
              placeholder="支持开具增值税电子发票..."
              className="w-full rounded-md border border-line-subtle bg-well px-3 py-2 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
            />
          </div>
        </div>
      </div>

      {/* 2. 问答管理列表 */}
      <div className="rounded-xl border border-line-subtle bg-surface overflow-hidden shadow-elevation-1">
        {/* 顶部工具栏 */}
        <div className="p-4 border-b border-line-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-well">
          <div className="flex items-center gap-2">
            <HelpCircle className="size-4 text-brand" />
            <h3 className="text-body-sm font-semibold text-ink">
              问答条目列表 ({filteredItems.length}/{config.items.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 类别下拉筛选 */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-control-sm rounded-md border border-line-subtle bg-surface px-3 text-body-sm text-ink focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-disabled" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索问题或解答内容..."
                className="h-control-sm w-48 sm:w-60 rounded-md border border-line-subtle bg-surface pl-8 pr-3 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
              />
            </div>
          </div>
        </div>

        {/* 问答表格 */}
        <div className="overflow-x-auto scrollbar-rail">
          <table className="w-full text-left text-body-sm text-ink">
            <thead className="bg-well text-ink-muted border-b border-line-subtle text-caption font-medium uppercase tracking-[0.04em]">
              <tr>
                <th className="py-3 px-3 w-16 text-center">排序</th>
                <th className="py-3 px-3 w-28">分类</th>
                <th className="py-3 px-4 min-w-[220px]">问题标题 (Question)</th>
                <th className="py-3 px-4">解答概要 (Answer)</th>
                <th className="py-3 px-3 w-24 text-center">状态</th>
                <th className="py-3 px-4 w-36 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-body-sm text-ink-subtle">
                    未查找到匹配的问答条目
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-wash transition-colors duration-fast group">
                    <td className="py-3 px-3 text-center font-mono text-ink-muted">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, 'up')}
                          disabled={idx === 0}
                          className="text-ink-subtle hover:text-ink disabled:opacity-20 cursor-pointer p-0.5"
                          title="上移"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <span className="text-caption">{item.order || idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(idx, 'down')}
                          disabled={idx === filteredItems.length - 1}
                          className="text-ink-subtle hover:text-ink disabled:opacity-20 cursor-pointer p-0.5"
                          title="下移"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-micro font-medium bg-wash border border-line-subtle text-ink-muted">
                        {CATEGORIES.find((c) => c.value === item.category)?.label || item.category}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-medium text-ink">
                      {item.question}
                    </td>

                    <td className="py-3 px-4 text-ink-muted max-w-md">
                      <p className="line-clamp-2 leading-relaxed whitespace-pre-wrap text-caption">
                        {item.answer}
                      </p>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleItemEnabled(item.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-medium cursor-pointer transition-colors duration-fast ${
                          item.enabled
                            ? 'bg-success-soft text-success border border-success-line'
                            : 'bg-wash text-ink-subtle border border-line-subtle'
                        }`}
                        title={item.enabled ? '已展示在前台，点击隐藏' : '已隐藏，点击启用'}
                      >
                        {item.enabled ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                        <span>{item.enabled ? '显示中' : '已下架'}</span>
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="inline-flex items-center gap-1 h-control-xs px-2 rounded-md border border-line-subtle bg-raised hover:border-brand-line hover:text-brand text-ink text-caption transition-colors duration-fast cursor-pointer"
                          title="编辑问题与解答"
                        >
                          <Edit3 className="size-3 text-brand" />
                          <span>编辑</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="inline-flex items-center gap-1 h-control-xs px-2 rounded-md border border-danger-line bg-danger-soft hover:bg-danger-hover text-danger text-caption transition-colors duration-fast cursor-pointer"
                          title="删除该问答"
                        >
                          <Trash2 className="size-3" />
                          <span>删除</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 新增 / 编辑弹窗 */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-fast">
          <div className="relative w-full max-w-2xl rounded-xl border border-line-subtle bg-overlay p-6 text-ink shadow-elevation-3">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3 mb-4">
              <h3 className="text-card-title font-semibold text-ink flex items-center gap-2">
                <Edit3 className="size-4 text-brand" />
                <span>
                  {editingItem.id && config.items.some((x) => x.id === editingItem.id)
                    ? '编辑常见问题'
                    : '新增常见问题'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-ink-subtle hover:text-ink transition-colors duration-fast cursor-pointer p-1 rounded-md"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItemModal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-caption font-medium text-ink-muted">分类领域</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full h-control-sm rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
                  >
                    {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-caption font-medium text-ink-muted">展示排序号</label>
                  <input
                    type="number"
                    value={editingItem.order}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, order: Number(e.target.value) || 1 })
                    }
                    className="w-full h-control-sm rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-caption font-medium text-ink-muted">问题标题 (Question)</label>
                <input
                  type="text"
                  required
                  value={editingItem.question}
                  onChange={(e) => setEditingItem({ ...editingItem, question: e.target.value })}
                  placeholder="例如：订阅后切换套餐，算力及权益会怎么变化？"
                  className="w-full rounded-md border border-line-subtle bg-well px-3 py-2 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast"
                />
              </div>

              <div className="space-y-1">
                <label className="text-caption font-medium text-ink-muted">
                  解答正文 (Answer - 支持分行与段落)
                </label>
                <textarea
                  rows={6}
                  required
                  value={editingItem.answer}
                  onChange={(e) => setEditingItem({ ...editingItem, answer: e.target.value })}
                  placeholder="详细说明政策细节与规则，支持换行排版..."
                  className="w-full rounded-md border border-line-subtle bg-well p-3 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-ring focus:ring-1 focus:ring-brand-ring outline-none transition-[border-color,box-shadow] duration-fast leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={editingItem.enabled}
                  onChange={(e) => setEditingItem({ ...editingItem, enabled: e.target.checked })}
                  className="size-4 rounded border-line-subtle bg-well text-brand focus:ring-brand-ring"
                />
                <label htmlFor="enabledCheck" className="text-body-sm text-ink cursor-pointer">
                  在前台订阅弹窗中正式公开显示
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line-subtle">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                >
                  确定更新
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
