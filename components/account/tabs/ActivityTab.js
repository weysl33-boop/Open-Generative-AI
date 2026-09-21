'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export default function ActivityTab({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPublic, setIsPublic] = useState(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(''), 3000);
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/user/activity-dashboard', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('获取活跃数据失败');
      }
      const json = await res.json();
      setData(json);
      setIsPublic(json.user?.isActivityPublic !== false);
    } catch (err) {
      setError(err.message || '网络连接异常');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleTogglePrivacy = async (checked) => {
    setIsPublic(checked);
    setSavingPrivacy(true);
    try {
      const res = await fetch('/api/user/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActivityPublic: checked }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '保存隐私偏好失败');
        setIsPublic(!checked);
      } else {
        showToast(checked ? '创作偏好已设为公开' : '创作偏好已设为私密');
      }
    } catch (err) {
      showToast('网络连接错误');
      setIsPublic(!checked);
    } finally {
      setSavingPrivacy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 bg-wash rounded-lg" />
          <Skeleton className="h-4 w-48 bg-wash rounded" />
        </div>
        <Skeleton className="h-[280px] w-full bg-wash rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-[200px] bg-wash rounded-2xl" />
          <Skeleton className="h-[200px] bg-wash rounded-2xl" />
        </div>
      </div>
    );
  }

  const currentUser = data?.user || {
    userNumber: user?.userNumber || '000000',
    daysActive: 1,
    badgeTitle: '#探险家',
  };
  const metrics = data?.metrics || { totalCreations: 0, activeDays: 0, totalCredits: 0 };
  const weeks = data?.heatmap?.weeks || [];
  const topModels = data?.topModels || [];
  const preferences = data?.preferences || [];

  return (
    <div className="flex flex-col gap-6 w-full text-ink">
      {/* 1. 顶部问候栏与隐私控制 (严格对齐 Trae 布局视觉) */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-line-subtle pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <span>你好！用户{currentUser.userNumber}</span>
          </h1>
          <p className="mt-1.5 text-xs text-ink-muted">
            这是您使用 koyosim 的第 <span className="font-semibold text-ink">{currentUser.daysActive}</span> 天。
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-success-line bg-success-soft text-success shadow-elevation-1">
              <Sparkles className="size-3 text-success" />
              {currentUser.badgeTitle || '#探险家'}
            </span>
            <span className="text-[11px] text-ink-subtle font-mono">
              UID: {currentUser.userNumber}
            </span>
          </div>
        </div>

        {/* 隐私切换控制条 (满足需求：允许用户在个人主页隐藏活跃记录等，对外使用我的创作) */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-raised shrink-0">
          <div className="text-right">
            <div className="text-xs font-medium text-ink flex items-center justify-end gap-1">
              {isPublic ? <Eye className="size-3 text-success" /> : <EyeOff className="size-3 text-warning" />}
              <span>{isPublic ? '主页公开活跃记录' : '对外隐藏活跃记录'}</span>
            </div>
            <p className="text-[11px] text-ink-muted">
              {isPublic ? '访客可查看活跃网格' : '对外仅展示「我的创作」'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={isPublic}
            disabled={savingPrivacy}
            onChange={(e) => handleTogglePrivacy(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 text-success focus:ring-success cursor-pointer"
            title="切换主页活跃记录公开状态"
          />
        </div>
      </div>

      {/* 2. 主面板：AI 创作活跃天数 (参考 Trae 跃天数热力图贡献网格) */}
      <Card className="rounded-2xl border border-line bg-raised p-6 shadow-elevation-1 overflow-hidden">
        <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold text-ink tracking-wide">
              AI 创作活跃天数
            </CardTitle>
            <span title="统计过去 52 周每日的作品生成与交互活跃记录" className="cursor-help text-ink-muted hover:text-ink">
              <HelpCircle className="size-3.5" />
            </span>
          </div>
          <div className="text-xs text-ink-muted">
            过去 365 天累计活动 <span className="font-semibold text-success font-mono">{data?.heatmap?.totalContributions || 0}</span> 次
          </div>
        </CardHeader>

        <CardContent className="p-0 space-y-6">
          {/* 热力图主体滚动容器 */}
          <div className="overflow-x-auto custom-scrollbar pb-2">
            <div className="min-w-[760px]">
              {/* 月份刻度 */}
              <div className="flex text-micro text-ink-muted pl-6 mb-1 select-none">
                {MONTH_LABELS.map((m, i) => (
                  <div key={i} className="flex-1 text-left font-mono">
                    {m}
                  </div>
                ))}
              </div>

              {/* 网格行（7行表示周日到周六） */}
              <div className="flex gap-1.5 items-start">
                {/* 星期标签 */}
                <div className="flex flex-col justify-between text-micro text-ink-muted h-[100px] pr-1.5 select-none shrink-0 py-0.5">
                  <span>周日</span>
                  <span>周二</span>
                  <span>周四</span>
                  <span>周六</span>
                </div>

                {/* 52 周列网格 */}
                <div className="flex gap-1 flex-1">
                  {weeks.map((week, wIndex) => (
                    <div key={week.weekIndex ?? wIndex} className="flex flex-col gap-1">
                      {week.days.map((day, dIndex) => {
                        const levelColors = [
                          'bg-overlay hover:border-line-strong',
                          'bg-success border-success-line text-success',
                          'bg-success border-success-line text-success',
                          'bg-success border-success-line text-ink',
                          'bg-success border-success text-ink-on-accent',
                        ];
                        const bgClass = levelColors[day.level] || levelColors[0];

                        return (
                          <div
                            key={day.date || dIndex}
                            className={`w-3 h-3 rounded-[2.5px] transition-all cursor-pointer border border-transparent ${bgClass}`}
                            onMouseEnter={() => setHoveredDay(day)}
                            onMouseLeave={() => setHoveredDay(null)}
                            title={`${day.date}: 生成与互动 ${day.count} 次`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 底部图例与悬停详情 */}
              <div className="flex items-center justify-between mt-3 pt-2 text-[11px] text-ink-muted border-t border-line-subtle">
                <div className="h-4">
                  {hoveredDay ? (
                    <span className="text-success font-mono">
                      {hoveredDay.date} 贡献了 {hoveredDay.count} 次创作生成
                    </span>
                  ) : (
                    <span className="text-ink-muted">悬停方格查看每日详细创作次数</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 select-none">
                  <span>较少</span>
                  <span className="w-2.5 h-2.5 rounded-xs bg-overlay" />
                  <span className="w-2.5 h-2.5 rounded-xs bg-success" />
                  <span className="w-2.5 h-2.5 rounded-xs bg-success" />
                  <span className="w-2.5 h-2.5 rounded-xs bg-success" />
                  <span className="w-2.5 h-2.5 rounded-xs bg-success" />
                  <span>更多</span>
                </div>
              </div>
            </div>
          </div>

          {/* 两行统计指标 (严格参考 Trae 的「代码验收」和「聊天天数」) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-line-subtle">
            <div className="p-3.5 rounded-xl bg-wash border border-line-subtle">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span>AI 创作与作品验收</span>
                <HelpCircle className="size-3 text-ink-muted" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-ink font-mono">
                {metrics.totalCreations > 0 ? `${metrics.totalCreations} 次` : '—'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-wash border border-line-subtle">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span>AI 创作活跃天数</span>
                <HelpCircle className="size-3 text-ink-muted" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-ink font-mono">
                {metrics.activeDays > 0 ? `${metrics.activeDays} 天` : '—'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-wash border border-line-subtle">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span>累计消耗创作积分</span>
                <HelpCircle className="size-3 text-ink-muted" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-ink font-mono">
                {metrics.totalCredits > 0 ? `${metrics.totalCredits} 积分` : '0 积分'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. 底部双卡片：最常合作的 AI 伙伴 & 最近模型调用偏好 (严格对齐 Trae 规范与空态) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左卡片：最常合作的 AI 伙伴 */}
        <Card className="rounded-2xl border border-line bg-raised p-6 shadow-elevation-1 flex flex-col justify-between min-h-[220px]">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-semibold text-ink tracking-wide">
                最常合作的 AI 伙伴
              </CardTitle>
              <HelpCircle className="size-3.5 text-ink-muted cursor-help" />
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 flex flex-col justify-center">
            {topModels.length === 0 ? (
              // Trae 同款优雅空态 (月亮/睡觉 zzZ + 您目前没有此数据)
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-2xl font-bold text-ink-muted select-none tracking-widest font-mono mb-2">
                  z<span className="text-xl">z</span><span className="text-base">Z</span>
                </div>
                <p className="text-xs text-ink-muted">您目前没有此数据。</p>
              </div>
            ) : (
              <div className="space-y-3.5 py-2">
                {topModels.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink font-mono">{item.model}</span>
                      <span className="text-ink-muted font-mono">{item.count} 次 ({item.percentage}%)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-wash-strong overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all duration-page"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右卡片：最近模型调用偏好 */}
        <Card className="rounded-2xl border border-line bg-raised p-6 shadow-elevation-1 flex flex-col justify-between min-h-[220px]">
          <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-semibold text-ink tracking-wide">
                最近模型调用偏好
              </CardTitle>
              <HelpCircle className="size-3.5 text-ink-muted cursor-help" />
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 flex flex-col justify-center">
            {preferences.length === 0 ? (
              // Trae 同款优雅空态 (月亮/睡觉 zzZ + 您目前没有此数据)
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-2xl font-bold text-ink-muted select-none tracking-widest font-mono mb-2">
                  z<span className="text-xl">z</span><span className="text-base">Z</span>
                </div>
                <p className="text-xs text-ink-muted">您目前没有此数据。</p>
              </div>
            ) : (
              <div className="space-y-3.5 py-2">
                {preferences.map((item, idx) => {
                  const categoryLabels = {
                    image: '图像生图与超清',
                    video: '动态视频运镜',
                    audio: 'AI 音乐与音效',
                    workflow: '设计智能体与工作流',
                  };
                  return (
                    <div key={idx} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink">
                          {categoryLabels[item.category] || item.category}
                        </span>
                        <span className="text-ink-muted font-mono">{item.percentage}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-wash-strong overflow-hidden">
                        <div
                          className="h-full bg-brand rounded-full transition-all duration-page"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full border border-line-strong bg-overlay/95 px-5 py-2 text-xs font-medium text-ink shadow-elevation-4 backdrop-blur-md animate-in fade-in slide-in-from-top-2"
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
