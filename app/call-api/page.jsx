import React from 'react';
import SupplierMarquee from '@/components/call-api/SupplierMarquee';
import PremiumFooter from '@/components/call-api/PremiumFooter';
import InteractiveCanvasPreview from '@/components/call-api/InteractiveCanvasPreview';
import StudioFeatureGrid from '@/components/call-api/StudioFeatureGrid';
import CreativeGallery from '@/components/call-api/CreativeGallery';

export const metadata = {
  title: 'KoyoSIM AI Studio | 新一代旗舰级生成式 AI 视觉创作平台',
  description: '聚合全球顶尖生图与视频模型。无需管理多个平台，在统一专业画布中自由创作超写实人像、电影级分镜、商业海报与动态视觉。',
};

export default function CallApiPage() {
  return (
    <div className="min-h-screen bg-[#07080b] text-[#f3f4f6] selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden font-sans">
      
      {/* 顶部科技光斑背景与微粒网格 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[580px] bg-gradient-to-b from-cyan-500/15 via-violet-600/10 to-transparent blur-[120px] rounded-full" />
        <div className="absolute top-[900px] -left-60 w-[600px] h-[600px] bg-cyan-600/10 blur-[140px] rounded-full" />
        <div className="absolute top-[1800px] -right-60 w-[700px] h-[700px] bg-violet-600/10 blur-[160px] rounded-full" />
        <div 
          className="absolute inset-0 opacity-40" 
          style={{
            backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* 1. 顶部全局导航栏：直达首页各功能模块 */}
        <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#07080b]/80 backdrop-blur-xl">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            
            {/* 左侧 Brand Logo */}
            <div className="flex items-center gap-8">
              <a href="/studio" className="flex items-center gap-3 group">
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 p-[1px] shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
                  <div className="w-full h-full bg-[#07080b] rounded-[11px] flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400 group-hover:rotate-12 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
                      <polyline points="21 15 16 10 5 21" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-white tracking-tight">KoyoSIM</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">AI STUDIO</span>
                </div>
              </a>

              {/* 核心导航链接：与首页 Studio 深度对接 */}
              <nav className="hidden md:flex items-center gap-1 text-sm text-neutral-300">
                <a href="/studio" className="px-3.5 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors flex items-center gap-1.5">
                  <span>创作工作台</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                </a>
                <a href="/community" className="px-3.5 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                  灵感社区
                </a>
                <a href="/studio/workflows" className="px-3.5 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                  节点工作流
                </a>
                <a href="/pricing" className="px-3.5 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                  会员与算力
                </a>
              </nav>
            </div>

            {/* 导航右侧：渲染集群状态、免费算力点与直达创作按钮 */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>GPU 集群在线</span>
              </div>

              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs">
                <span className="text-amber-400 font-semibold">⚡ 1,000</span>
                <span className="text-neutral-400">新人点数</span>
              </div>

              <a
                href="/studio"
                className="relative group inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5"
              >
                <span>立即开启创作</span>
                <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </div>
        </header>

        {/* 2. Hero 极具视觉冲击力核心区 */}
        <section id="hero" className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* 顶部动态亮点标签 */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-cyan-500/30 text-xs text-neutral-300 backdrop-blur-md shadow-inner shadow-cyan-500/10">
                <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-cyan-300 font-semibold">全新上线</span>
                <span className="text-neutral-500">|</span>
                <span>FLUX.1 [pro] 1.1 Ultra 与 Midjourney v6.1 已入驻 Studio 工作台</span>
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 核心超级主标与副标 */}
            <div className="text-center max-w-4xl mx-auto mb-10">
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
                一个工作台 · 释放<br />
                <span className="bg-gradient-to-r from-white via-cyan-300 to-cyan-500 bg-clip-text text-transparent">
                  全模态 AI 创意生产力
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-neutral-400 font-normal leading-relaxed max-w-2xl mx-auto">
                聚合全球顶尖生图与视频模型。无需在多个平台间频繁切换，在统一专业画布中自由创作超写实人像、电影级分镜、商业海报与动态视觉。
              </p>
            </div>

            {/* CTA 操作组：直接引导至首页核心功能 */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
              <a
                href="/studio"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>立即进入 Studio 免费创作</span>
              </a>

              <a
                href="/community"
                className="px-7 py-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-white font-semibold text-sm border border-white/[0.12] hover:border-white/[0.25] backdrop-blur-md hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>探索社区精选大作 (10万+)</span>
              </a>

              <a
                href="/pricing"
                className="px-6 py-4 rounded-xl text-neutral-300 hover:text-white font-medium text-sm transition-colors flex items-center gap-1.5"
              >
                <span>查看会员与算力方案</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* 核心交互体验区：生图预览与同款一键 Remix */}
            <InteractiveCanvasPreview />

          </div>
        </section>

        {/* 3. 【重点吸收】：全球顶尖生图与视觉模型无缝无限滑动跑马灯 */}
        <SupplierMarquee />

        {/* 4. 深度结合首页 4 大工坊功能网格 */}
        <StudioFeatureGrid />

        {/* 5. 创作者社区精选作品流与一键同款 Remix */}
        <CreativeGallery />

        {/* 6. 【高端奢华生图平台专属页脚】 */}
        <PremiumFooter />

      </div>
    </div>
  );
}
