'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function ProviderCard({ provider }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(provider.lastCheck || null);
  const [showRotate, setShowRotate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runTest = async () => {
    setTesting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setTestResult(data.data);
        setMessage(`健康探针探测完成：${data.data.status} (${data.data.latency_ms || data.data.latencyMs || 0}ms)`);
      } else {
        setMessage(data?.error?.message || data?.error || '健康检查失败');
      }
    } catch (err) {
      setMessage(err.message || '网络连接异常');
    } finally {
      setTesting(false);
    }
  };


  const handleRotate = async (e) => {
    e.preventDefault();
    if (!window.confirm('轮换密钥将立即覆盖现有生产凭证，是否确认提交？')) return;

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/secret`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          secretName: provider.kind === 'ai' ? 'api_key' : 'secret_key',
          secretValue: newKey,
          adminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '轮换失败');
      setMessage('密钥轮换成功，已安全加密存盘');
      setNewKey('');
      setAdminPassword('');
      setShowRotate(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between relative overflow-hidden transition-[border-color,box-shadow] duration-fast hover:border-brand-ring hover:shadow-elevation-2">
      <div>
        <div className="flex items-start justify-between border-b border-line-subtle pb-3 mb-4">
          <div>
            <span className="font-mono text-micro font-semibold uppercase tracking-wider text-brand">
              {provider.kind === 'ai' ? 'AI MODEL ENGINE' : 'PAYMENT GATEWAY'}
            </span>
            <h3 className="mt-1 text-card-title text-ink">{provider.name}</h3>
          </div>
          <StatusBadge tone={provider.configured ? 'good' : 'warn'}>
            {provider.configured ? '已就绪' : '待配置'}
          </StatusBadge>
        </div>

        <p className="text-body-xs text-ink-muted mb-4">{provider.description}</p>

        <div className="space-y-2 rounded-lg border border-line-subtle bg-well p-3 text-body-xs">
          <div className="flex justify-between items-center">
            <span className="text-ink-muted">通信模式</span>
            <span className="font-mono text-ink">{provider.mode}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-ink-muted">密钥存储机制</span>
            <span className="text-brand font-medium">写入式（不可反显明文）</span>
          </div>
          {provider.unavailableReason && (
            <div className="flex justify-between items-start gap-3">
              <span className="text-ink-muted shrink-0">未就绪原因</span>
              <span className="text-warn text-right">{provider.unavailableReason}</span>
            </div>
          )}
          {testResult && (
            <div className="flex justify-between items-center border-t border-line-subtle pt-2">
              <span className="text-ink-muted">最近健康状况</span>
              <span className={testResult.status === 'healthy' ? 'text-good font-semibold' : 'text-warn'}>
                {testResult.status} ({testResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>

        {/* 密钥轮换折叠表单 */}
        {showRotate && (
          <form onSubmit={handleRotate} className="mt-4 rounded-lg border border-line-subtle bg-surface p-4 space-y-3">
            <p className="text-body-xs font-semibold text-brand">安全密钥轮换（仅限超管）</p>
            <div>
              <label className="block text-body-xs text-ink-muted font-medium mb-1">新密钥明文（只写一次）</label>
              <input
                type="password"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-..."
                className="h-control-md w-full rounded-md border border-line-subtle bg-well px-3 text-body-xs text-ink font-mono placeholder:text-ink-subtle outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
              />
            </div>
            <div>
              <label className="block text-body-xs text-ink-muted font-medium mb-1">当前超管密码（二次确认）</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="你的管理员密码"
                className="h-control-md w-full rounded-md border border-line-subtle bg-well px-3 text-body-xs text-ink font-mono placeholder:text-ink-subtle outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRotate(false)}
                className="h-control-sm rounded-md border border-line-subtle bg-transparent px-3 text-body-xs font-medium text-ink-muted hover:bg-wash hover:text-ink transition"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-control-sm rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-xs font-medium text-ink-on-accent transition disabled:opacity-50"
              >
                {busy ? '轮换中…' : '确认轮换'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-5 pt-3.5 border-t border-line-subtle flex items-center justify-between">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="inline-flex h-control-md items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-3 text-body-xs font-medium text-ink hover:bg-wash transition disabled:opacity-50"
        >
          {testing ? '探针发送中…' : '心跳诊断探针'}
        </button>

        <button
          type="button"
          onClick={() => setShowRotate(!showRotate)}
          className="inline-flex h-control-md items-center rounded-md border border-line-subtle bg-well px-3.5 text-body-xs font-medium text-ink-muted hover:text-ink hover:bg-wash transition"
        >
          {showRotate ? '收起' : '轮换密钥 ⚙'}
        </button>
      </div>

      {message && <p className="mt-2 text-body-xs text-ink-muted">{message}</p>}
    </Card>
  );
}
