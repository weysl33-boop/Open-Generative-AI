'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function ModelsManagerClient({ initialModels }) {
  const [models, setModels] = useState(initialModels);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', cost_usd: 0, credits_price: 1 });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleToggleActive = async (model) => {
    setBusy(true);
    const newStatus = !model.is_active;
    try {
      const res = await fetch(`/api/admin/models/${model.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ is_active: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '更新失败');

      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, is_active: newStatus ? 1 : 0 } : m))
      );
      showToast(`模型 ${model.name} 已${newStatus ? '开启上线' : '暂停服务'}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (model) => {
    setEditingId(model.id);
    setEditForm({
      name: model.name,
      cost_usd: model.cost_usd,
      credits_price: model.credits_price,
    });
  };

  const saveEdit = async (id) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '保存失败');

      setModels((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                name: editForm.name,
                cost_usd: Number(editForm.cost_usd),
                credits_price: Number(editForm.credits_price),
              }
            : m
        )
      );
      setEditingId(null);
      showToast('模型参数与成本定价已保存');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-line-subtle bg-surface px-4 py-2.5 text-body-sm text-ink shadow-elevation-4">
          {toast}
        </div>
      )}

      <div className="grid gap-4">
        {models.map((m) => {
          const isEditing = editingId === m.id;
          return (
            <Card key={m.id} className="p-4 transition hover:border-line-strong">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* 模型名称与标识 */}
                <div className="min-w-[220px] flex-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        m.is_active ? 'bg-success shadow-elevation-1' : 'bg-ink-disabled'
                      }`}
                    />
                    {isEditing ? (
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs font-semibold text-ink outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                      />
                    ) : (
                      <h3 className="text-body-sm font-semibold text-ink">{m.name}</h3>
                    )}
                    <span className="rounded border border-line-subtle bg-wash px-1.5 py-0.5 text-micro font-medium text-ink-muted">
                      {m.type === 'video' ? '🎬 视频' : m.type === 'image' ? '📷 图像' : '🎵 音频'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-micro text-ink-subtle">{m.id} · 供应商: {m.provider.toUpperCase()}</p>
                </div>

                {/* 成本价与 Credits 扣除 */}
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-micro text-ink-subtle">单次官方成本 (USD)</p>
                    {isEditing ? (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-body-xs text-ink-subtle">$</span>
                        <input
                          type="number"
                          step="0.001"
                          value={editForm.cost_usd}
                          onChange={(e) => setEditForm({ ...editForm, cost_usd: e.target.value })}
                          className="h-control-sm w-20 rounded-md border border-line-subtle bg-well px-2 text-body-xs font-mono text-ink outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                        />
                      </div>
                    ) : (
                      <p className="mt-1 font-mono text-body-xs font-medium text-warn">${Number(m.cost_usd || 0).toFixed(3)}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-micro text-ink-subtle">用户扣除额度 (Credits)</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editForm.credits_price}
                        onChange={(e) => setEditForm({ ...editForm, credits_price: e.target.value })}
                        className="mt-1 h-control-sm w-16 rounded-md border border-line-subtle bg-well px-2 text-body-xs font-mono text-brand outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                      />
                    ) : (
                      <p className="mt-1 font-mono text-body-xs font-semibold text-brand">{m.credits_price} 点</p>
                    )}
                  </div>

                  <div>
                    <p className="text-micro text-ink-subtle">当前状态</p>
                    <div className="mt-1">
                      <StatusBadge tone={m.is_active ? 'good' : 'neutral'}>
                        {m.is_active ? '正常上线' : '已暂停'}
                      </StatusBadge>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(m.id)}
                        className="h-control-sm rounded-md bg-brand px-3 text-body-xs font-medium text-ink-on-accent transition hover:bg-brand-hover active:bg-brand-active disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="h-control-sm rounded-md border border-line-subtle px-3 text-body-xs font-medium text-ink-muted hover:bg-wash hover:text-ink transition"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="h-control-sm rounded-md border border-line-subtle bg-surface px-3 text-body-xs font-medium text-ink hover:bg-wash hover:text-ink transition"
                      >
                        配置定价
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleToggleActive(m)}
                        className={`h-control-sm rounded-md border px-3 text-body-xs font-medium transition-colors duration-fast disabled:opacity-50 ${
                          m.is_active
                            ? 'border-danger-line bg-danger-soft text-danger hover:bg-danger-hover'
                            : 'border-success-line bg-success-soft text-success hover:bg-success-soft'
                        }`}
                      >
                        {m.is_active ? '暂停下架' : '一键启用'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
