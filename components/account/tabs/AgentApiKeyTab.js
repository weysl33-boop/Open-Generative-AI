'use client';

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ShieldAlert, KeyRound, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AgentApiKeyTab() {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [notice, setNotice] = useState('');

  const fetchKey = async () => {
    try {
      const res = await fetch('/api/user/api-key');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          setApiKey(data.apiKey);
          if (data.createdAt) {
            setCreatedAt(new Date(data.createdAt).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }));
          }
        }
      }
    } catch (err) {
      console.error('获取 API 密钥失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKey();
  }, []);

  const handleCopy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (!window.confirm('重新生成密钥将导致现存使用旧密钥的自建 Agent 与自动化脚本失效，是否继续？')) {
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch('/api/user/api-key', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setApiKey(data.apiKey);
        if (data.createdAt) {
          setCreatedAt(new Date(data.createdAt).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }));
        }
        setNotice('新密钥已生成并永久同步至云端数据库');
        setTimeout(() => setNotice(''), 3000);
      } else {
        setNotice(data.error || '重新生成失败');
        setTimeout(() => setNotice(''), 3000);
      }
    } catch (err) {
      console.error('重新生成 API 密钥失败:', err);
      setNotice('网络请求失败，请稍后重试');
      setTimeout(() => setNotice(''), 3000);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="w-full flex flex-col h-full max-w-3xl mx-auto">
      <h3 className="text-xl font-bold text-ink text-center mb-6 tracking-tight">
        Agent API 密钥
      </h3>

      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-line-subtle bg-raised p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-success" />
                <h4 className="text-sm font-semibold text-ink">默认 Agent 访问密钥</h4>
              </div>
              <p className="text-xs text-ink-muted mt-1">用于集成自建 Agent、剧本生成流水线或本地 CLI 工具</p>
            </div>
            {createdAt && (
              <span className="text-[11px] text-ink-subtle font-mono">创建于: {createdAt}</span>
            )}
          </div>

          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-ink-muted text-xs">
              <Loader2 className="size-4 animate-spin text-success" />
              <span>正在从云端读取您的 API 密钥...</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
              <div className="flex-1 bg-well border border-line rounded-xl px-3.5 py-2 flex items-center justify-between font-mono text-xs text-ink min-h-[40px]">
                <span className="truncate mr-2">
                  {apiKey ? (showKey ? apiKey : `${apiKey.slice(0, 14)}••••••••••••••••`) : '暂无密钥'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-ink-muted hover:text-ink transition-colors shrink-0 p-1"
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-[40px] px-4 rounded-xl border-line bg-wash text-xs text-ink hover:bg-wash-strong hover:text-ink font-medium flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-success" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      复制密钥
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={regenerating}
                  onClick={handleRegenerate}
                  className="h-[40px] px-4 rounded-xl border-line bg-wash text-xs text-ink hover:bg-wash-strong hover:text-ink font-medium flex items-center gap-1.5"
                >
                  <RefreshCw className={`size-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? '生成中...' : '重新生成'}
                </Button>
              </div>
            </div>
          )}

          {notice && (
            <div className="text-xs text-success bg-success-soft border border-success-soft rounded-xl px-3 py-2 animate-in fade-in">
              {notice}
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-warning-soft bg-warning-soft p-3.5 text-xs text-warning mt-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <p>API 密钥拥有账户下所有模型调用的完全权限，请勿将密钥提交至公开代码仓库或客户端应用中。所有调用额度将从当前账户中实时扣除。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
