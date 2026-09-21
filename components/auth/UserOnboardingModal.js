'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Sparkles,
  Check,
  Compass,
  Palette,
  Film,
  Workflow,
  Bot,
  User,
  Star,
} from 'lucide-react';

const INDUSTRIES = [
  {
    id: 'free',
    name: '自由创作',
    desc: '独立创作者 · 艺术探索',
    isSpecial: true,
    tagId: 'tag_ind_freelance',
  },
  {
    id: 'media',
    name: '个人 / 自媒体',
    desc: '爆款图文 · 社交账号矩阵',
    color: 'from-blue-600/30 to-indigo-900/40',
    border: 'hover:border-info-line',
    icon: '📱',
    tagId: 'tag_ind_media',
  },
  {
    id: 'anime',
    name: '短漫剧',
    desc: 'AI 漫改 · 短剧分镜制作',
    color: 'from-amber-600/30 to-orange-900/40',
    border: 'hover:border-warning-line',
    icon: '🎬',
    tagId: 'tag_ind_anime',
  },
  {
    id: 'game',
    name: '游戏',
    desc: '角色原画 · 道具与场景资产',
    color: 'from-purple-600/30 to-violet-900/40',
    border: 'hover:border-line-strong',
    icon: '🎮',
    tagId: 'tag_ind_game',
  },
  {
    id: 'ecommerce',
    name: '电商',
    desc: '模特商拍 · 3D 产品静物展',
    color: 'from-pink-600/30 to-rose-900/40',
    border: 'hover:border-pink-500/50',
    icon: '🛍️',
    tagId: 'tag_ind_ecommerce',
  },
  {
    id: 'advertising',
    name: '广告',
    desc: '商业视觉海报 · 品牌宣发',
    color: 'from-cyan-600/30 to-teal-900/40',
    border: 'hover:border-brand-ring',
    icon: '📣',
    tagId: 'tag_ind_ad',
  },
  {
    id: 'mv',
    name: 'MV',
    desc: '音乐视频 · 唯美电影视效',
    color: 'from-rose-600/30 to-red-900/40',
    border: 'hover:border-danger-ring',
    icon: '🎵',
    tagId: 'tag_ind_mv',
  },
];

const ZODIAC_SIGNS = [
  { name: '白羊座', icon: '♈', date: '3.21-4.19' },
  { name: '金牛座', icon: '♉', date: '4.20-5.20' },
  { name: '双子座', icon: '♊', date: '5.21-6.21' },
  { name: '巨蟹座', icon: '♋', date: '6.22-7.22' },
  { name: '狮子座', icon: '♌', date: '7.23-8.22' },
  { name: '处女座', icon: '♍', date: '8.23-9.22' },
  { name: '天秤座', icon: '♎', date: '9.23-10.23' },
  { name: '天蝎座', icon: '♏', date: '10.24-11.22' },
  { name: '射手座', icon: '♐', date: '11.23-12.21' },
  { name: '摩羯座', icon: '♑', date: '12.22-1.19' },
  { name: '水瓶座', icon: '♒', date: '1.20-2.18' },
  { name: '双鱼座', icon: '♓', date: '2.19-3.20' },
];

const SITE_FEATURES = [
  {
    id: 'image',
    name: '图像精绘',
    desc: 'Nano / Flux / SD 超清文生图与高清重绘',
    icon: Palette,
    color: 'text-brand',
  },
  {
    id: 'video',
    name: 'AI 视频生成',
    desc: 'Wan 2.1 / Kling / MiniMax 电影级文生视频',
    icon: Film,
    color: 'text-purple-400',
  },
  {
    id: 'workflow',
    name: '商业工作流',
    desc: 'Vibe Canvas 可视化多节点批量工业化流程',
    icon: Workflow,
    color: 'text-indigo-400',
  },
  {
    id: 'agent',
    name: 'AI 创意智能体',
    desc: '智能角色、创意策划与多智能体协同设计',
    icon: Bot,
    color: 'text-warning',
  },
];

export default function UserOnboardingModal({ user, onComplete, onClose }) {
  const initialName = user?.displayName || user?.display_name || user?.name || '';
  const [displayName, setDisplayName] = useState(initialName);
  const [selectedIndustry, setSelectedIndustry] = useState('free');
  const [selectedZodiac, setSelectedZodiac] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState(['image', 'video']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggleFeature = (id) => {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((f) => f !== id) : prev) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);

    try {
      const activeIndustryObj = INDUSTRIES.find((i) => i.id === selectedIndustry);
      const industryName = activeIndustryObj ? activeIndustryObj.name : '自由创作';

      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || user?.displayName,
          zodiac: selectedZodiac || null,
          industry: industryName,
          occupation: industryName,
          preferences: {
            features: selectedFeatures,
            industryId: selectedIndustry,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存偏好失败');
      }

      onComplete?.(data.data);
    } catch (err) {
      setError(err.message || '网络连接异常');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-3 sm:p-5 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[860px] max-h-[92vh] rounded-2xl border border-line-strong bg-overlay-glass shadow-elevation-4 overflow-hidden backdrop-blur-2xl flex flex-col">
        {/* 顶部标题区（对齐参考图：绿色萌芽吉祥物 + 标题 + 关闭按钮） */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 bg-overlay shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-success-soft border border-success-line flex items-center justify-center text-base">
              🌱
            </div>
            <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight">
              选择你的行业，快速开启创作
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-wash-strong hover:text-ink transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 滚动内容区域 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 custom-scrollbar">
          {/* 1. 行业选择卡片组（完全对齐参考图：左侧自由创作大卡片，右侧2行3列场景网格） */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-3 flex items-center justify-between">
              <span>一、您的创作领域或行业场景</span>
              <span className="text-[11px] text-brand font-normal">点击选中将生成对应运营模型预设</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* 左侧大卡片：+ 自由创作 */}
              <button
                type="button"
                onClick={() => setSelectedIndustry('free')}
                className={`relative flex flex-col items-center justify-center rounded-2xl border p-5 text-center transition-all cursor-pointer min-h-[140px] md:min-h-[180px] ${
                  selectedIndustry === 'free'
                    ? 'border-brand-ring bg-brand-soft text-ink'
                    : 'border-dashed border-line-strong bg-transparent text-ink-muted hover:border-line-strong hover:text-ink hover:bg-wash'
                }`}
              >
                {selectedIndustry === 'free' && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-brand text-ink-on-accent flex items-center justify-center text-xs font-bold">
                    <Check className="size-3" />
                  </span>
                )}
                <div className="size-10 rounded-full border border-current flex items-center justify-center mb-3">
                  <Plus className="size-5" />
                </div>
                <span className="text-sm font-bold tracking-wide">自由创作</span>
                <span className="text-[11px] text-ink-muted mt-1">独立创作者 · 无限制</span>
              </button>

              {/* 右侧 6 个行业场景卡片网格 (2行3列) */}
              <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {INDUSTRIES.filter((i) => !i.isSpecial).map((item) => {
                  const isSelected = selectedIndustry === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedIndustry(item.id)}
                      className={`relative flex flex-col items-start justify-between rounded-2xl border p-3.5 text-left transition-all cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'border-brand-ring bg-brand-soft'
                          : `border-line bg-transparent ${item.border} hover:bg-wash`
                      }`}
                    >
                      {/* 背景微渐变 */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-40 pointer-events-none`} />

                      {isSelected && (
                        <span className="absolute top-2 right-2 size-4.5 rounded-full bg-brand text-ink-on-accent flex items-center justify-center text-micro font-bold z-10">
                          <Check className="size-2.5" />
                        </span>
                      )}

                      <div className="relative z-10 flex items-center gap-2 mb-2">
                        <span className="text-xl">{item.icon}</span>
                        <span className="text-xs sm:text-sm font-bold text-ink">{item.name}</span>
                      </div>

                      <p className="relative z-10 text-micro text-ink-muted line-clamp-1">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. 互动资料填写（用户昵称与星座选择） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-line-subtle">
            {/* 用户昵称 */}
            <div>
              <label className="block text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
                <User className="size-3.5 text-brand" />
                <span>二、您的创作者昵称</span>
              </label>
              <div className="flex h-10 w-full items-center rounded-xl border border-line bg-canvas px-3 focus-within:border-brand-ring focus-within:ring-2 focus-within:ring-brand-soft transition">
                <input
                  type="text"
                  maxLength={24}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="请输入您的创作者昵称"
                  className="w-full bg-transparent text-xs sm:text-sm text-ink placeholder-ink-subtle"
                />
              </div>
            </div>

            {/* 星座选择 */}
            <div>
              <label className="block text-xs font-semibold text-ink mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Star className="size-3.5 text-warning" />
                  <span>三、您的星座（选填）</span>
                </span>
                <span className="text-[11px] text-ink-muted">
                  {selectedZodiac || '未选择'}
                </span>
              </label>

              <div className="flex flex-wrap gap-1.5 max-h-[86px] overflow-y-auto pr-1">
                {ZODIAC_SIGNS.map((zod) => {
                  const active = selectedZodiac === zod.name;
                  return (
                    <button
                      key={zod.name}
                      type="button"
                      onClick={() => setSelectedZodiac(active ? '' : zod.name)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        active
                          ? 'bg-warning-soft text-warning border border-warning-line'
                          : 'bg-wash text-ink-muted hover:text-ink border border-line-subtle'
                      }`}
                    >
                      <span>{zod.icon}</span>
                      <span>{zod.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. 网站优势功能偏好 */}
          <div className="pt-2 border-t border-line-subtle">
            <label className="block text-xs font-semibold text-ink mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-brand" />
                <span>四、您在 KoyoSIM 最感兴趣的优势功能（多选）</span>
              </span>
              <span className="text-[11px] text-ink-muted">便于智能推荐专属生图与生视频管线</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SITE_FEATURES.map((feat) => {
                const Icon = feat.icon;
                const active = selectedFeatures.includes(feat.id);
                return (
                  <button
                    key={feat.id}
                    type="button"
                    onClick={() => toggleFeature(feat.id)}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                      active
                        ? 'border-brand-ring bg-brand-soft'
                        : 'border-line bg-transparent hover:bg-wash'
                    }`}
                  >
                    <div className={`mt-0.5 size-7 rounded-lg bg-wash flex items-center justify-center shrink-0 ${feat.color}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink">{feat.name}</span>
                        {active && <Check className="size-3 text-brand" />}
                      </div>
                      <p className="text-micro text-ink-muted mt-0.5 truncate">{feat.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="rounded-xl border border-danger-line bg-danger-soft p-2.5 text-xs text-danger text-center">
              {error}
            </div>
          )}

          {/* 底部提交按钮 */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-xl bg-brand hover:bg-brand-hover active:scale-[0.99] text-body-sm font-bold text-ink-on-accent shadow-elevation-2 transition  disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {busy ? (
                <span>正在保存偏好并生成专属画廊…</span>
              ) : (
                <>
                  <span>完成设定，快速开启创作</span>
                  <Compass className="size-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
