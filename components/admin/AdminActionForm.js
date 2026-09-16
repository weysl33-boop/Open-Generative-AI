'use client';

import { useState } from 'react';

export default function AdminActionForm({
  action,
  method = 'POST',
  fields = [],
  label = '提交',
  tone = 'secondary',
  confirmMessage = '确认执行此管理操作？操作会写入审计日志。',
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setBusy(true);
    setMessage('');
    setIsError(false);

    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());

    try {
      const response = await fetch(action, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || '操作失败');
      }

      setMessage('操作成功已生效');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      setIsError(true);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {fields.map((field) => (
          <input
            key={field.name}
            required={field.required !== false}
            name={field.name}
            type={field.type || 'text'}
            defaultValue={field.defaultValue || ''}
            placeholder={field.placeholder}
            className="min-w-[140px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/50"
          />
        ))}
        <button
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
            tone === 'primary'
              ? 'bg-cyan-300 text-black hover:bg-cyan-200'
              : tone === 'danger'
              ? 'border border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/20'
              : 'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
          } disabled:opacity-50`}
        >
          {busy ? '处理中…' : label}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${isError ? 'text-red-300' : 'text-cyan-200'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
