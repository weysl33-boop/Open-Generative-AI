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
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4 mb-4">
        <div>
          <h2 className="text-sm font-bold text-white">服务端实时运行与异常日志 (Tail 100)</h2>
          <p className="mt-1 text-xs text-white/40 font-mono">{logSource || 'PM2 Daemon Logs'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-black/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setLogType('out')}
              className={`rounded px-3 py-1 font-semibold transition ${
                logType === 'out' ? 'bg-cyan-300/20 text-cyan-200' : 'text-white/50 hover:text-white'
              }`}
            >
              标准输出 (Out)
            </button>
            <button
              type="button"
              onClick={() => setLogType('error')}
              className={`rounded px-3 py-1 font-semibold transition ${
                logType === 'error' ? 'bg-red-400/20 text-red-300' : 'text-white/50 hover:text-white'
              }`}
            >
              异常报错 (Error)
            </button>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchLogs()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition"
          >
            {loading ? '刷新中…' : '🔄 刷新'}
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#020202] p-4 font-mono text-xs text-emerald-300/90 leading-relaxed custom-scrollbar whitespace-pre-wrap">
        {logs || '暂无日志'}
      </div>
    </Card>
  );
}
