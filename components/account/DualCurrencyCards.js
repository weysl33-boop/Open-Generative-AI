'use client';

import { useState, useEffect } from 'react';
import { ArrowUpRight, Check, Crown, Gift, Gem, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AssetCard({ tone, iconBg, iconColor, icon: Icon, label, badge, description, value, unit, action, onAction, children }) {
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
          className="h-8 border-line bg-wash text-ink hover:border-brand-ring hover:bg-brand-soft hover:text-brand cursor-pointer active:scale-95 transition-all"
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
  points = 120,
  planName = '免费体验版',
  planId = 'free',
  onOpenRecharge,
  onOpenCheckIn,
  checkedInToday = false,
  className = '',
}) {
  const [signedIn, setSignedIn] = useState(checkedInToday);
  const [pointsBonusAnim, setPointsBonusAnim] = useState(false);

  useEffect(() => {
    setSignedIn(checkedInToday);
  }, [checkedInToday]);

  const signIn = () => {
    if (signedIn) {
      onOpenCheckIn?.();
      return;
    }
    setSignedIn(true);
    setPointsBonusAnim(true);
    window.setTimeout(() => setPointsBonusAnim(false), 1800);
    onOpenCheckIn?.();
  };

  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <AssetCard
          tone="text-warning"
          iconBg="bg-warning-soft border-warning-line"
          iconColor="text-warning"
          icon={Zap}
          label="K 币余额"
          badge="算力货币"
          description="用于高质量生图、视频与模型推理"
          value={Number(credits).toLocaleString()}
          unit="K 币"
          action="立即充值"
          onAction={onOpenRecharge}
        >
          <div className="mt-3.5 flex flex-wrap gap-2 border-t border-line-subtle pt-2.5 text-[11px] text-ink-subtle">
            <span>实时入账：{Number(credits).toLocaleString()} K 币</span>
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
          value={(Number(points) + (signedIn && !checkedInToday ? 20 : 0)).toLocaleString()}
          unit="积分"
          action={signedIn ? '今日已签到' : '每日签到 +20'}
          onAction={signIn}
        >
          <div className="relative mt-3.5 flex items-center justify-between gap-2 border-t border-line-subtle pt-2.5 text-[11px] text-ink-subtle">
            <span>每日签到免费领 · 抵扣基础对话与灵感生成</span>
            {pointsBonusAnim && (
              <span className="absolute -top-3 right-1 text-xs font-semibold text-success animate-fade-in-up">
                +20 积分
              </span>
            )}
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

