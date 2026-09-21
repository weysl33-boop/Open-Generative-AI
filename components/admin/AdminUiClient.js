'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CopyableId({ id, label }) {
  const [copied, setCopied] = useState(false);
  if (!id) return '—';

  const copy = () => {
    navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const display = label || (id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id);

  return (
    <button
      type="button"
      onClick={copy}
      title="点击复制完整 ID"
      className="group inline-flex items-center gap-1 font-mono text-xs text-ink-muted transition hover:text-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring rounded"
    >
      <span>{display}</span>
      <span className="text-micro text-ink-subtle group-hover:text-brand">
        {copied ? '✓' : '⧉'}
      </span>
    </button>
  );
}
export function ConfirmActionDialog({
  isOpen,
  onClose,
  onConfirm,
  title = '确认执行操作？',
  description = '该操作为高风险管理动作，将同步写入不可篡改的审计日志。',
  requirePassword = false,
  confirmLabel = '确认执行',
  tone = 'danger',
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);
    try {
      await onConfirm({ password });
      onClose();
    } catch (err) {
      setError(err.message || '操作执行失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-raised p-6 shadow-elevation-4">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{description}</p>

        {requirePassword && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-ink mb-1.5">
              管理员二次验证密码
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入当前管理员密码"
              size="md"
            />
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-2.5 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={loading}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            disabled={loading || (requirePassword && !password)}
            loading={loading}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
