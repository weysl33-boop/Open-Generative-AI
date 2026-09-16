'use client';

import { useState } from 'react';

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
      className="group inline-flex items-center gap-1 font-mono text-xs text-white/70 transition hover:text-cyan-200"
    >
      <span>{display}</span>
      <span className="text-[10px] text-white/30 group-hover:text-cyan-300">
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

  const btnTone =
    tone === 'danger'
      ? 'border-red-400/40 bg-red-500/20 text-red-200 hover:bg-red-500/30'
      : 'border-cyan-300/40 bg-cyan-300/20 text-cyan-100 hover:bg-cyan-300/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0e] p-6 shadow-2xl shadow-black/80">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-white/60">{description}</p>

        {requirePassword && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-white/70">
              管理员二次验证密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入当前管理员密码"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-300/50 focus:outline-none focus:ring-1 focus:ring-cyan-300/50"
            />
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10"
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading || (requirePassword && !password)}
            onClick={handleConfirm}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${btnTone} disabled:opacity-50`}
          >
            {loading ? '执行中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
