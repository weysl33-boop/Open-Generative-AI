'use client';

import React, { useState } from 'react';

export default function InteractiveCodeTerminal() {
  const [activeLang, setActiveLang] = useState('curl');
  const [copied, setCopied] = useState(false);

  const codeSnippets = {
    curl: `# 统一调用全模态生成接口 (以 Seedance 2.5 视频生成为例)
curl -X POST "https://api.koyosim.com/v1/video/generate" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "seedance-2.5-global/multimodal-video",
    "prompt": "电影级赛博朋克雨夜街道，霓虹倒影，超高清8k，极速运镜",
    "aspect_ratio": "16:9",
    "duration": 5
  }'`,
    python: `# 使用官方 Python SDK
from koyosim import KoyoClient

client = KoyoClient(api_key="YOUR_API_KEY")

response = client.video.create(
    model="seedance-2.5-global/multimodal-video",
    prompt="电影级赛博朋克雨夜街道，霓虹倒影，超高清8k，极速运镜",
    aspect_ratio="16:9",
    duration=5
)

print(response.video_url)`,
    node: `// Node.js / TypeScript 极速接入
import { KoyoAI } from '@koyosim/sdk';

const ai = new KoyoAI({ apiKey: process.env.KOYO_API_KEY });

const task = await ai.video.generate({
  model: 'seedance-2.5-global/multimodal-video',
  prompt: '电影级赛博朋克雨夜街道，霓虹倒影，超高清8k，极速运镜',
  duration: 5,
});

console.log(task.outputUrl);`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippets[activeLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden border border-white/[0.1] bg-[#0c0f17]/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/5">
      {/* 终端顶部状态栏 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-3 text-xs font-mono text-neutral-400">api.koyosim.com/v1/multimodal/generate</span>
        </div>

        {/* 语言切换器与复制 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/[0.06] text-xs font-mono">
            {['curl', 'python', 'node'].map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`px-2.5 py-1 rounded transition-all ${
                  activeLang === lang
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js'}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>

      {/* 终端代码体 */}
      <div className="p-6 font-mono text-xs leading-relaxed overflow-x-auto bg-[#080a10]">
        <pre className="text-neutral-200">
          <code>{codeSnippets[activeLang]}</code>
        </pre>
      </div>

      {/* 实时响应指示条 */}
      <div className="px-6 py-2.5 border-t border-white/[0.06] bg-black/40 flex items-center justify-between text-[11px] font-mono text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-neutral-400">Response: 200 OK (142ms)</span>
        </div>
        <span className="text-neutral-500">Streaming: Supported</span>
      </div>
    </div>
  );
}
