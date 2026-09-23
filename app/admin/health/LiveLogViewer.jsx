'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/admin/AdminUi';

export default function LiveLogViewer() {
  const [logType, setLogType] = useState('out');
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [logSource, setLogSource] = useState('');

  const fetchLogs = async (type = logType) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/system/logs?type=${type}`);
      const data = await res.json();
      if (data.data) {
        setLogs(data.data.lines);
        setLogSource(data.data.path);
      }
    } catch {
      setLogs('获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(logType);
  }, [logType]);

  return (
    <Card className="mt-6 border-line-subtle bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-4 mb-4">
        <div>
          <h2 className="text-body-sm font-bold text-ink">服务端实时运行与异常日志 (Tail 100)</h2>
          <p className="mt-1 text-body-xs text-ink-subtle font-mono">{logSource || 'PM2 Daemon Logs'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-well p-0.5 border border-line-subtle text-body-xs">
            <button
              type="button"
              onClick={() => setLogType('out')}
              className={`h-control-xs rounded px-3 font-medium transition-colors ${
                logType === 'out' ? 'bg-raised text-label shadow-elevation-1' : 'text-ink-subtle hover:text-ink'
              }`}
            >
              标准输出 (Out)
            </button>
            <button
              type="button"
              onClick={() => setLogType('error')}
              className={`h-control-xs rounded px-3 font-medium transition-colors ${
                logType === 'error' ? 'bg-danger-soft text-danger border border-danger-line' : 'text-ink-subtle hover:text-ink'
              }`}
            >
              异常报错 (Error)
            </button>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchLogs()}
            className="h-control-sm rounded-md border border-line-subtle bg-raised hover:bg-raised-hover text-label px-3 text-body-xs transition-colors"
          >
            {loading ? '刷新中…' : '🔄 刷新'}
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto rounded-xl border border-line-subtle bg-canvas p-4 font-mono text-body-xs text-good leading-relaxed scrollbar-rail whitespace-pre-wrap">
        {logs || '暂无日志'}
      </div>
    </Card>
  );
}
