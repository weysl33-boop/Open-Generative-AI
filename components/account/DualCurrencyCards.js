'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Crown, Gift, Gem, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const WEEKDAY_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 最近 7 天签到格：连签的那几天格子写「第 N 天」，其余只写日期，
// 这样「昨天签了 → 今天这格就是第 2 天」在界面上自洽，不需要用户自己数。
function CheckInStrip({ days = [], today, streak = 0 }) {
  // 今天没签时，活的连签结束在昨天那一格（与服务端的 runEnd 同一口径）。
  const runEnd = days.length - 1 - (days[days.length - 1]?.checkedIn ? 0 : 1);
  const runStart = runEnd - streak + 1;
  return (
    <ol className="mt-2.5 flex items-end justify-between gap-1">
      {days.map((day, index) => {
        const isToday = day.date === today;
        const inRun = streak > 0 && day.checkedIn && index >= runStart;
        return (
          <li key={day.date} className="flex min-w-0 flex-col items-center gap-1">
            <span
              className={`flex size-7 items-center justify-center rounded-md border font-mono text-micro tabular-nums ${
                day.checkedIn
                  ? 'border-success-line bg-success-soft text-success'
                  : 'border-line bg-wash text-ink-subtle'
              } ${isToday ? 'outline outline-1 outline-offset-1 outline-brand' : ''}`}
            >
              {inRun ? index - runStart + 1 : (day.checkedIn ? <Check className="size-3" /> : Number(day.date.slice(8)))}
            </span>
            <span className={`text-micro ${isToday ? 'text-ink' : 'text-ink-subtle'}`}>
              {isToday ? '今天' : WEEKDAY_SHORT[new Date(`${day.date}T00:00:00`).getDay()]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AssetCard({ tone, iconBg, iconColor, icon: Icon, label, badge, description, value, unit, action, actionDisabled, onAction, children }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line-subtle bg-base/85 p-5 shadow-elevation-1 transition-all hover:border-line-strong backdrop-blur-sm">
      <div className="flex flex-row items-start justify-between gap-3 pb-3.5">
        <div className="flex items-start gap-3">
          <span className={`flex size-10 items-center justify-center rounded-xl border ${iconBg} ${iconColor}`}>
            <Icon className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              {label}
              <Badge variant="outline" className={`px-1.5 py-0 text-micro ${iconColor} border-current/30 bg-current/10`}>
                {badge}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{description}</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={actionDisabled}
          className="h-8 border-line bg-wash text-ink hover:border-brand-ring hover:bg-brand-soft hover:text-brand cursor-pointer active:scale-95 transition-all disabled:cursor-default disabled:opacity-60"
          onClick={onAction}
        >
          <span>{action}</span>
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
      <div className="pt-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-semibold tracking-[-0.04em] tabular-nums ${tone}`}>{value}</span>
          <span className="text-xs font-medium text-ink-muted">{unit}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function DualCurrencyCards({
  credits = 0,
  points = 0,
  planName = '免费体验版',
  planId = 'free',
  onOpenRecharge,
  onOpenCheckIn,
  checkedInToday = false,
  claiming = false,
  checkIn = null,
  className = '',
}) {
  const [bonusAnim, setBonusAnim] = useState(false);
  const previousSignedIn = useRef(checkedInToday);

  // 只有服务端确认入账之后才飘这一次 +N：原来的乐观动画在签到失败时也会飘，
  // 而失败恰恰是常态（重复点击），于是界面写着到账、账本里却没有这笔。
  useEffect(() => {
    const justSignedIn = !previousSignedIn.current && checkedInToday;
    previousSignedIn.current = checkedInToday;
    if (!justSignedIn) return undefined;
    setBonusAnim(true);
    const timer = window.setTimeout(() => setBonusAnim(false), 1800);
    return () => window.clearTimeout(timer);
  }, [checkedInToday]);

  const reward = checkIn?.rewardCredits;
  const signedInLabel = checkedInToday
    ? '今日已签到'
    : (reward ? `每日签到 +${reward}` : '每日签到领积分');
  let checkInHeadline = '每日签到免费领 · 抵扣基础对话与灵感生成';
  if (checkIn && checkIn.streak > 0) {
    checkInHeadline = checkIn.todayChecked
      ? `已连续签到 ${checkIn.streak} 天`
      : `已连续签到 ${checkIn.streak} 天 · 今天签到即连续 ${checkIn.streak + 1} 天`;
  }

  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <AssetCard
          tone="text-warning"
          iconBg="bg-warning-soft border-warning-line"
          iconColor="text-warning"
          icon={Zap}
          label="算力积分"
          badge="算力货币"
          description="用于高质量生图、视频与模型推理"
          value={Number(credits).toLocaleString()}
          unit="积分"
          action="立即充值"
          onAction={onOpenRecharge}
        >
          <div className="mt-3.5 flex flex-wrap gap-2 border-t border-line-subtle pt-2.5 text-[11px] text-ink-subtle">
            <span>实时入账：{Number(credits).toLocaleString()} 积分</span>
            <span>·</span>
            <span>支持多模型推理与高清画质消耗</span>
          </div>
        </AssetCard>

        <AssetCard
          tone="text-success"
          iconBg="bg-success-soft border-success-line"
          iconColor="text-success"
          icon={Gem}
          label="我的积分"
          badge="成长激励"
          description="签到、分享创作赚取，可抵扣轻量任务"
          value={Number(points).toLocaleString()}
          unit="积分"
          action={signedInLabel}
          actionDisabled={checkedInToday || claiming}
          onAction={onOpenCheckIn}
        >
          <div className="relative mt-3.5 border-t border-line-subtle pt-2.5">
            {bonusAnim && reward ? (
              <span className="absolute -top-3 right-1 text-caption font-semibold text-success animate-fade-in">
                {`+${reward} 积分`}
              </span>
            ) : null}
            <p className="text-caption text-ink-subtle">{checkInHeadline}</p>
            {checkIn?.days?.length ? (
              <CheckInStrip days={checkIn.days} today={checkIn.today} streak={checkIn.streak} />
            ) : null}
          </div>
        </AssetCard>
      </div>

      <div className="rounded-xl border border-line-subtle bg-base/85 p-4 sm:p-5 shadow-elevation-1 backdrop-blur-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-brand-line bg-brand-soft text-brand">
              <Crown className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{planName}</p>
                <Badge variant={planId === 'free' ? 'outline' : 'accent'} className="text-[11px]">
                  {planId === 'free' ? '免费权益' : '订阅生效中'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {planId === 'free'
                  ? '升级 Pro 专业版，解锁专属极速 GPU 队列与 4K / 8K 超清输出。'
                  : '当前订阅正在生效，尊享全天候高速通道。'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="self-start sm:self-auto cursor-pointer active:scale-95 transition-all"
            onClick={onOpenRecharge}
          >
            {planId === 'free' ? '升级会员套餐' : '管理订阅'}
          </Button>
        </div>
      </div>
    </section>
  );
}

