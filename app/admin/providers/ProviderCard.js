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
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data.data);
      }
    } catch {}
    finally {
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
    <Card className="flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              {provider.kind === 'ai' ? 'AI MODEL ENGINE' : 'PAYMENT GATEWAY'}
            </span>
            <h3 className="mt-1 text-lg font-bold text-white">{provider.name}</h3>
          </div>
          <StatusBadge tone={provider.configured ? 'good' : 'warn'}>
            {provider.configured ? '已就绪' : '待配置'}
          </StatusBadge>
        </div>

        <p className="text-xs text-white/60 mb-4">{provider.description}</p>

        <div className="space-y-2.5 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-white/40">通信模式</span>
            <span className="font-medium text-white/80">{provider.mode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">密钥存储机制</span>
            <span className="text-cyan-200/80">写入式（不可反显明文）</span>
          </div>
          {testResult && (
            <div className="flex justify-between border-t border-white/[0.05] pt-2">
              <span className="text-white/40">最近健康状况</span>
              <span className={testResult.status === 'healthy' ? 'text-emerald-300 font-bold' : 'text-amber-300'}>
                {testResult.status} ({testResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>

        {/* 密钥轮换折叠表单 */}
        {showRotate && (
          <form onSubmit={handleRotate} className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-3">
            <p className="text-[11px] font-bold text-cyan-200">安全密钥轮换（仅限超管）</p>
            <div>
              <label className="block text-[11px] text-white/50 mb-1">新密钥明文（只写一次）</label>
              <input
                type="password"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-white/15 bg-[#0a0a0a] px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/50 mb-1">当前超管密码（二次确认）</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="你的管理员密码"
                className="w-full rounded-lg border border-white/15 bg-[#0a0a0a] px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRotate(false)}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-cyan-300 px-3.5 py-1 text-xs font-bold text-black hover:bg-cyan-200"
              >
                {busy ? '轮换中…' : '确认轮换'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
        >
          {testing ? '探针发送中…' : '心跳诊断探针'}
        </button>

        <button
          type="button"
          onClick={() => setShowRotate(!showRotate)}
          className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-300/20"
        >
          {showRotate ? '收起' : '轮换密钥 ⚙'}
        </button>
      </div>

      {message && <p className="mt-2 text-xs text-cyan-200">{message}</p>}
    </Card>
  );
}
