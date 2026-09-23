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
            className="min-w-[140px] flex-1 rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          />
        ))}
        <button
          disabled={busy}
          className={`h-control-md rounded-md px-4 text-body-sm font-medium transition-[background-color,border-color,color] duration-fast ${
            tone === 'primary'
              ? 'bg-brand text-ink-on-accent hover:bg-brand-hover'
              : tone === 'danger'
              ? 'border border-danger-line bg-danger-soft text-danger hover:bg-danger-hover'
              : 'border border-line-subtle bg-raised text-ink hover:border-line hover:bg-overlay'
          } disabled:opacity-50`}
        >
          {busy ? '处理中…' : label}
        </button>
      </div>
      {message && (
        <p className={`text-caption ${isError ? 'text-danger' : 'text-brand'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
