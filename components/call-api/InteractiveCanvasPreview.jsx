'use client';

import React, { useState } from 'react';

const PRESETS = [
  {
    id: 'cyberpunk',
    title: '赛博朋克雨夜',
    style: '电影质感 · 8K 光追',
    model: 'FLUX.1 [pro] 1.1',
    prompt: '未来高科技赛博朋克雨夜街道，半透明全息招牌，水洼反光倒影，精致的人体机械细节，极高动态范围摄影，8k分辨率，电影级色调。',
    aspectRatio: '16:9',
    steps: 28,
    cfg: 3.5,
    seed: '78291410',
    accentColor: 'from-cyan-500 to-blue-600',
    tag: 'FLUX 旗舰',
    imageUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'portrait',
    title: '大师级超写实肖像',
    style: '微距质感 · 皮肤毛孔级',
    model: 'Midjourney v6.1',
    prompt: '电影级特写肖像，真实自然的人物皮肤微观纹理，柔和侧光打亮发丝，哈苏中画幅相机拍摄，浅景深虚化背景，85mm镜头。',
    aspectRatio: '1:1',
    steps: 32,
    cfg: 6.0,
    seed: '9482103',
    accentColor: 'from-amber-500 to-orange-600',
    tag: 'MJ v6.1 质感',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'oriental',
    title: '东方新国风幻想',
    style: '水墨光影 · 意境写意',
    model: '通义万相 Qwen 2.1',
    prompt: '东方神话浮空仙岛，云雾缭绕的水墨山川与青金石点缀，金色晨曦穿透云层，古风仙侠飞鹤掠过苍穹，恢弘磅礴构图。',
    aspectRatio: '16:9',
    steps: 30,
    cfg: 4.5,
    seed: '3318920',
    accentColor: 'from-purple-500 to-indigo-600',
    tag: '东方审美',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'cinematic-motion',
    title: '电影级动态分镜',
    style: '4K 运镜 · 物理动力学',
    model: 'Google Veo 3.1 & 可灵 1.5',
    prompt: '高速穿越未来的巨型环形空间站，星云璀璨，巨大的推进器离子蓝色火焰喷涌，电影级推轨镜头，高精粒子物理碰撞。',
    aspectRatio: '21:9',
    steps: 50,
    cfg: 5.0,
    seed: '6102844',
    accentColor: 'from-emerald-500 to-teal-600',
    tag: '动态运镜',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1200&auto=format&fit=crop',
  },
];

export default function InteractiveCanvasPreview() {
  const [selectedId, setSelectedId] = useState('cyberpunk');
  const [copied, setCopied] = useState(false);

  const current = PRESETS.find((p) => p.id === selectedId) || PRESETS[0];

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(current.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto rounded-3xl overflow-hidden border border-white/[0.1] bg-[#0c0f17]/90 backdrop-blur-2xl shadow-2xl shadow-cyan-500/10">
      
      {/* 顶部体验切换栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02] gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs font-mono text-neutral-400 pl-2">
            KoyoSIM Studio · 灵感画布与生成预览
          </span>
        </div>

        {/* 风格 Tab 切换 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedId === p.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* 主体左右分区：左侧画面与渲染效果，右侧参数与一键创作 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        
        {/* 左侧：画质大图展示 */}
        <div className="lg:col-span-7 relative bg-black flex items-center justify-center min-h-[380px] lg:min-h-[460px] overflow-hidden group">
          <img
            src={current.imageUrl}
            alt={current.title}
            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

          {/* 画面悬浮信息标签 */}
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-mono">
                {current.model}
              </span>
              <span className="px-2 py-1 rounded-md bg-cyan-500/30 backdrop-blur-md border border-cyan-400/30 text-cyan-200 text-xs font-mono">
                {current.aspectRatio} · 4K UHD
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400 bg-black/50 px-2 py-1 rounded backdrop-blur-md">
              Seed: {current.seed}
            </span>
          </div>
        </div>

        {/* 右侧：提示词、参数面板与直达 Studio 创作 */}
        <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between bg-[#0e121d] border-t lg:border-t-0 lg:border-l border-white/[0.08]">
          
          <div className="space-y-5">
            {/* 标题与模型 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-cyan-400 font-bold">
                  {current.tag}
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">{current.title}</h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white/[0.06] text-xs text-neutral-300 font-mono border border-white/[0.08]">
                {current.style}
              </span>
            </div>

            {/* 提示词卡片 */}
            <div className="rounded-xl bg-[#080a10] border border-white/[0.08] p-4 text-xs font-mono text-neutral-300 relative group">
              <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-2 pb-1.5 border-b border-white/[0.06]">
                <span className="text-cyan-300 font-semibold">生成提示词 (Prompt)</span>
                <button
                  onClick={handleCopyPrompt}
                  className="hover:text-white flex items-center gap-1 transition-colors text-[10px]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copied ? '已复制！' : '复制提示词'}</span>
                </button>
              </div>
              <p className="leading-relaxed select-all text-neutral-200">{current.prompt}</p>
            </div>

            {/* 核心生图参数 */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-[10px] text-neutral-500 block">采样步数</span>
                <span className="text-white font-bold">{current.steps} steps</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-[10px] text-neutral-500 block">CFG Scale</span>
                <span className="text-cyan-400 font-bold">{current.cfg}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-[10px] text-neutral-500 block">画幅比</span>
                <span className="text-amber-400 font-bold">{current.aspectRatio}</span>
              </div>
            </div>
          </div>

          {/* 底部与首页功能深度融合的直达 CTA */}
          <div className="pt-6 border-t border-white/[0.08] mt-6 space-y-2.5">
            <a
              href="/studio"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>在 Studio 中一键 Remix 同款创作</span>
            </a>

            <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1">
              <span>免费账户即赠 1,000 点算力</span>
              <a href="/community" className="text-cyan-400 hover:text-cyan-300 font-medium">
                查看社区更多精选作品 &rarr;
              </a>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
