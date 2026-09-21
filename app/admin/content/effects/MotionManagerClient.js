'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { Sparkles, Zap, Shield, Save, CheckCircle2, AlertCircle } from 'lucide-react';

const MOTION_LEVELS = [
  {
    id: 'full',
    name: '炫酷高帧 (Full)',
    badge: '推荐高配',
    desc: '启用全部流光、径向氛围扩散光晕、呼吸脉冲及卡片立体悬停过渡，提供极致现代化视觉享受。',
    icon: Sparkles,
  },
  {
    id: 'balanced',
    name: '平衡模式 (Balanced)',
    badge: '通用标准',
    desc: '保留关键交互微动效与轻量光晕，关闭高负载持续渲染循环，兼顾视觉质感与各端平稳流畅。',
    icon: Zap,
  },
  {
    id: 'minimal',
    name: '极简节能 (Minimal)',
    badge: '省电流畅',
    desc: '关闭全站背景流光与重度动画，完全响应系统的减弱动态效果规范，专为移动端或低性能工控设备优化。',
    icon: Shield,
  },
];

export default function MotionManagerClient({ initialMotion }) {
  const [motion, setMotion] = useState(initialMotion || {});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const res = await fetch('/api/admin/content/motion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(motion),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || '保存动效配置失败');
      }

      setMotion(data.data || motion);
      setFeedback({ type: 'success', message: '动效配置已更新，前台已即刻同步生效！' });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 实时动效交互预览卡片 */}
      <div className="rounded-2xl border border-line bg-canvas p-6 shadow-elevation-4 relative overflow-hidden">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-line-subtle relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <Sparkles className="size-4 text-brand" />
            <span>前台动效模式模拟视窗</span>
          </div>
          <span className="text-[11px] text-ink-subtle">模拟当前设置下的 Studio 卡片微动交互</span>
        </div>

        {/* 模拟前台环境背景流光 */}
        <div className="relative rounded-xl border border-line bg-canvas p-8 overflow-hidden min-h-[220px] flex items-center justify-center">
          {motion.ambientGlow && (
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-gradient-to-b from-brand-pressed via-indigo-500/15 to-transparent blur-3xl opacity-80 animate-pulse" />
          )}

          {/* 模拟 Studio 交互卡片 */}
          <div className={`relative z-10 w-full max-w-sm rounded-2xl border border-line bg-wash p-5 shadow-elevation-4 backdrop-blur-md transition-all duration-page ${
            motion.cardTiltHover ? 'hover:scale-[1.03] hover:border-brand-ring hover:shadow-brand-soft cursor-pointer' : ''
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-brand" />
                <span className="text-xs font-bold text-ink">Cinema Studio 电影工作室</span>
              </div>
              <span className="text-micro px-2 py-0.5 rounded-full bg-wash-press text-ink-muted">
                {motion.motionLevel.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed mb-4">
              这里是 Studio 模块预览卡片。把鼠标悬浮在此卡片上方，可直观测试卡片微浮效果。
            </p>
            <div className="flex items-center justify-between text-[11px] text-brand-hover">
              <span>{motion.cardTiltHover ? '✔ 3D 微动悬停已激活' : '✕ 卡片微动已禁用'}</span>
              <span>{motion.ambientGlow ? '✔ 背景氛围光已开启' : '✕ 氛围光已关闭'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 动效等级与细项表单 */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink">动效综合能耗级别 (Motion Level)</h2>
            <p className="text-[11px] text-ink-subtle mt-0.5">
              全局决定全站 CSS 3D 转换、GPU 加速图层与渲染开销
            </p>
          </div>

          <div className="grid gap-3.5 md:grid-cols-3">
            {MOTION_LEVELS.map((lvl) => {
              const Icon = lvl.icon;
              const isSelected = motion.motionLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setMotion({ ...motion, motionLevel: lvl.id })}
                  className={`flex flex-col text-left rounded-xl p-4 border transition-all ${
                    isSelected
                      ? 'border-brand bg-brand-soft shadow-elevation-2 shadow-brand-soft'
                      : 'border-line bg-wash hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-brand-pressed text-brand-hover' : 'bg-wash text-ink-subtle'}`}>
                        <Icon className="size-4" />
                      </div>
                      <span className="text-xs font-bold text-ink">{lvl.name}</span>
                    </div>
                    <span className={`text-micro px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30' : 'bg-white/5 text-ink-subtle'
                    }`}>
                      {lvl.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed flex-1">
                    {lvl.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 细分子项开关 */}
        <Card className="space-y-4">
          <div className="border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink">特定视觉元素细项开关</h2>
            <p className="text-[11px] text-ink-subtle mt-0.5">针对特定视觉特效进行个性化微调</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-line-subtle bg-wash">
              <div>
                <h3 className="text-xs font-semibold text-ink">Studio 顶部氛围弥散光晕 (Ambient Glow)</h3>
                <p className="text-[11px] text-ink-subtle mt-0.5">
                  在前台顶部中央渲染深空青蓝与紫色的柔和呼吸光晕，大幅增强高质感赛博氛围。
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(motion.ambientGlow)}
                onChange={(e) => setMotion({ ...motion, ambientGlow: e.target.checked })}
                className="size-4 rounded border-line-strong bg-scrim text-brand focus:ring-brand-ring"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-line-subtle bg-wash">
              <div>
                <h3 className="text-xs font-semibold text-ink">模块卡片 3D 微动与悬停发光 (Card Tilt Hover)</h3>
                <p className="text-[11px] text-ink-subtle mt-0.5">
                  当用户将鼠标悬停在创作模块、推荐模型及应用卡片上时，产生轻微上浮与边框流光高亮。
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(motion.cardTiltHover)}
                onChange={(e) => setMotion({ ...motion, cardTiltHover: e.target.checked })}
                className="size-4 rounded border-line-strong bg-scrim text-brand focus:ring-brand-ring"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-line-subtle bg-wash">
              <div>
                <h3 className="text-xs font-semibold text-ink">横幅呼吸脉冲光点 (Banner Pulse Dot)</h3>
                <p className="text-[11px] text-ink-subtle mt-0.5">
                  在顶部推广横幅的徽标左侧显示带有环形涟漪动画的小白点，吸引访客目光。
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(motion.bannerPulse)}
                onChange={(e) => setMotion({ ...motion, bannerPulse: e.target.checked })}
                className="size-4 rounded border-line-strong bg-scrim text-brand focus:ring-brand-ring"
              />
            </div>
          </div>
        </Card>

        {/* 保存反馈 */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              {feedback.message && (
                <div className={`flex items-center gap-2 text-xs ${
                  feedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {feedback.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
                  <span>{feedback.message}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-active to-blue-600 px-5 py-2.5 text-xs font-bold text-ink shadow-elevation-2 shadow-brand-soft hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Save className="size-4" />
              <span>{isSaving ? '正在更新动效...' : '保存动效设置并生效'}</span>
            </button>
          </div>
        </Card>
      </form>
    </div>
  );
}
