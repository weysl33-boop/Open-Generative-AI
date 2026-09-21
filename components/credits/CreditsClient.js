'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Gem,
  Crown,
  ArrowUpRight,
  Gift,
  Ticket,
  History,
  Loader2,
  Sparkles,
  Layers,
  Film,
  Image as ImageIcon,
  RotateCw,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import AuthModal from '@/components/AuthModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { localizedHref } from '@/lib/client/localeSwitch';

export default function CreditsClient() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [subCredits, setSubCredits] = useState(0);
  const [subExpiresAt, setSubExpiresAt] = useState(null);
  const [points, setPoints] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [planName, setPlanName] = useState('免费体验版');
  const [planId, setPlanId] = useState('free');
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [message, setMessage] = useState('');

  // 兑换码内联表单
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // 每日登录打卡状态
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claimingLogin, setClaimingLogin] = useState(false);
  // 签到状态以服务端 wallet.isCheckedInToday 为准，不靠账本文案字符串推断
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);

  const loadAccount = async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setPlanName(data.entitlements?.planName || (data.user.role === 'admin' ? '管理特权' : '免费体验版'));
          setPlanId(data.entitlements?.planId || 'free');

          // 硬币余额只认钱包表，权威值随后由 daily-login 覆盖
          setCoinBalance(Number(data.entitlements?.currencyWallet?.availableBalance ?? 0) || 0);

          // 算力桶解析
          if (data.entitlements?.creditBuckets) {
            const b = data.entitlements.creditBuckets;
            setSubCredits(Number(b.subscriptionCredits || 0));
            setSubExpiresAt(b.subscriptionExpiresAt || data.entitlements?.currentPeriodEnd || null);
            setPoints(Number(b.perpetualCredits || 0) + Number(b.dailyFree || 0));
            setTotalCredits(Number(b.totalAvailable || 0));
          } else {
            setTotalCredits(data.entitlements?.credits ?? data.user.credits ?? 0);
          }
        }
      }
    } catch {}
  };

  const loadDailyStatus = async () => {
    try {
      const res = await fetch('/api/financial/currency/daily-login', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      setDailyClaimed(Boolean(data.claimed));
      if (data.balance !== undefined) setCoinBalance(Number(data.balance));
      return Boolean(data.claimed);
    } catch {
      return false;
    }
  };

  // 服务端权威签到状态：账本 title/时间的字符串匹配会随本地时区与后端文案漂移
  const loadCheckinStatus = async () => {
    try {
      const res = await fetch('/api/financial/credits/wallet', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      const done = Boolean(data.wallet?.isCheckedInToday);
      setCheckedInToday(done);
      return done;
    } catch {
      return false;
    }
  };

  // 后端兜底文案目前不分语言（失败常回英文 "Failed"），中文界面里只作为附注保留，便于排查
  const serverErrorText = (raw, fallback) =>
    typeof raw === 'string' && /[\u4e00-\u9fff]/.test(raw) ? raw : `${fallback}（后端返回：${raw || '未知错误'}）`;

  const loadLedger = async () => {
    setLedgerLoading(true);
    setLedgerError('');
    try {
      const res = await fetch('/api/financial/credits/ledger');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLedgerError(res.status === 401 ? '登录已失效，请重新登录后查看资产流水' : serverErrorText(data.error, '资产流水加载失败，请稍后重试'));
        return;
      }
      if (Array.isArray(data.ledger)) {
        setLedger(data.ledger);
      }
    } catch {
      setLedgerError('网络连接异常，资产流水加载失败');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
    loadDailyStatus();
    loadCheckinStatus();
    loadLedger();
  }, []);

  // 领取每日登录 1 枚硬币
  const handleClaimDailyCoin = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (dailyClaimed || claimingLogin) return;
    setClaimingLogin(true);
    try {
      const res = await fetch('/api/financial/currency/daily-login', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || '🎉 成功领取今日登录奖励 1 枚硬币！');
        setDailyClaimed(true);
        setCoinBalance(Number(data.balance || coinBalance + 1));
        await loadLedger();
      } else if (res.status === 401) {
        setMessage('登录状态已失效，请重新登录后领取');
        setShowAuthModal(true);
      } else {
        // 失败不等于已领取：回读服务端，只有服务端说领过才锁定按钮
        const claimedOnServer = await loadDailyStatus();
        setMessage(claimedOnServer ? '今日登录奖励已领取' : '领取失败，请稍后重试');
      }
    } catch {
      setMessage('网络请求异常，请稍后重试');
    } finally {
      setClaimingLogin(false);
    }
  };

  // 积分签到打卡 (算力积分)
  const handleCheckIn = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (checkedInToday || checkinLoading) return;
    setCheckinLoading(true);
    try {
      const res = await fetch('/api/financial/credits/checkin', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(data.message || '签到成功，免费算力已入账！');
        setCheckedInToday(true);
        await loadAccount();
        await loadLedger();
      } else if (res.status === 401) {
        setMessage('登录状态已失效，请重新登录后签到');
        setShowAuthModal(true);
      } else {
        // 该路由把所有失败都折叠成 400 + 后端兜底文案，因此回读钱包判断是否其实已到账
        const doneOnServer = await loadCheckinStatus();
        setMessage(doneOnServer ? '今日积分已到账，无需重复签到' : '签到失败，请稍后重试');
      }
    } catch {
      setMessage('网络连接异常，签到失败');
    } finally {
      setCheckinLoading(false);
    }
  };

  // 兑换卡密
  const handleRedeemCoupon = async (e) => {
    e.preventDefault();
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!couponCode.trim() || couponLoading) return;
    setCouponLoading(true);
    try {
      const res = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '卡密无效或已被使用');
      setMessage(`兑换成功！已获得 ${data.amount || ''} 创作算力！`);
      setCouponCode('');
      await loadAccount();
      await loadLedger();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setCouponLoading(false);
    }
  };

  const filteredLedger = ledger.filter(
    (item) => ledgerFilter === 'all' || (ledgerFilter === 'recharge' ? item.type !== 'task' : item.type === 'task')
  );

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col selection:bg-warning-soft">
      <StudioHeader title="创作额度与硬币权益" subtitle="管理硬币、月度专属额度与算力积分" />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* 全局消息提示条 */}
        {message && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-warning-line bg-warning-soft px-5 py-3 text-xs font-semibold text-warning animate-in fade-in">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="text-ink-muted hover:text-ink cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* 顶部主标题与操作区 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">我的资产中心</span>
              <Badge variant="outline" className="text-micro border-success-line text-success bg-success-soft">
                硬币不可充值 · 不可提现 · 不可转让
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">我的创作资产与硬币</h1>
            <p className="text-xs text-ink-muted mt-1">
              涵盖站内互动硬币、订阅核心用户资产（月度专属额度）与通用算力积分。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 领取今日 1 枚硬币打卡按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClaimDailyCoin}
              disabled={dailyClaimed || claimingLogin}
              className={`gap-1.5 border-warning-line ${
                dailyClaimed
                  ? 'bg-warning-soft text-ink-muted border-line'
                  : 'bg-gradient-to-r from-warning-soft to-yellow-500/20 text-warning hover:bg-warning-soft active:scale-95'
              }`}
            >
              <span className="text-sm">🪙</span>
              <span>{dailyClaimed ? '今日已领 1 枚硬币' : '今日打卡领 1 枚硬币'}</span>
            </Button>

            {/* 会员订阅升级入口 */}
            <Link href={localizedHref('/pricing', { pathname })}>
              <Button variant="outline" size="sm" className="gap-1.5 border-brand-line bg-brand-soft text-brand-hover hover:bg-brand-pressed active:scale-95">
                <Crown className="size-3.5 text-warning" />
                <span>{planId === 'free' ? '开通商业订阅' : '管理订阅套餐'}</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-8 animate-in fade-in duration-base">
          {/* 三元资产卡片矩阵 */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* 1. 硬币账户（站内权益凭证，不可充值，参考 B 站硬币） */}
            <div className="relative overflow-hidden rounded-2xl border border-warning-line bg-gradient-to-b from-warning-soft via-well to-base p-5 shadow-elevation-3 backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-warning-line bg-warning-soft text-warning text-base">
                      🪙
                    </span>
                    <div>
                      <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                        <span>我的硬币</span>
                        <Badge className="text-micro bg-warning-soft text-warning border-warning-line">不可充值</Badge>
                      </div>
                      <span className="text-[11px] text-warning">每日登录与有效提交可得</span>
                    </div>
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black tracking-tight text-warning font-mono flex items-baseline gap-2">
                    <span>{coinBalance.toLocaleString()}</span>
                    <span className="text-xs font-normal text-warning">枚硬币</span>
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed mt-2">
                  站内互动与权益凭证，仅通过每日登录打卡、经审核采纳的建议与漏洞提交获得。用于社区投币支持与兑换站内权益。
                </p>
              </div>
              <div className="pt-4 mt-3 border-t border-line-subtle flex items-center justify-between">
                <Link href={localizedHref('/benefits', { pathname })} className="text-xs font-semibold text-warning hover:text-ink flex items-center gap-1">
                  <span>硬币权益中心</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
                <Link href={localizedHref('/account?action=feedback', { pathname })} className="text-xs font-semibold text-ink hover:text-warning flex items-center gap-1">
                  <span>提交赚硬币</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>

            {/* 2. 订阅专属额度 */}
            <div className="relative overflow-hidden rounded-2xl border border-brand-ring bg-gradient-to-b from-brand-soft via-base to-base p-5 shadow-elevation-3 backdrop-blur-md flex flex-col justify-between">
              <div className="absolute top-0 right-0 px-3 py-1 bg-brand-pressed rounded-bl-xl border-l border-b border-brand-line text-micro font-bold text-brand-hover">
                最高优先级抵扣
              </div>
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-brand-line bg-brand-pressed text-brand-hover">
                      <Layers className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                        <span>本月订阅专属额度</span>
                      </div>
                      <span className="text-[11px] text-brand-hover">{planName}</span>
                    </div>
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black tracking-tight text-ink font-mono">
                    {subCredits.toLocaleString()} <span className="text-xs font-normal text-brand-hover">额度</span>
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed mt-2">
                  订阅制核心用户资产，生图与生视频优先自动抵扣。按月刷新，当月用完即止。
                </p>
              </div>
              <div className="pt-4 mt-3 border-t border-line-subtle flex items-center justify-between">
                <span className="text-[11px] text-ink-subtle">
                  {subExpiresAt ? `重置日：${new Date(subExpiresAt).toLocaleDateString('zh-CN')}` : '开通套餐即享月度额度'}
                </span>
                <Link href={localizedHref('/pricing', { pathname })} className="text-xs font-semibold text-brand hover:text-brand-hover flex items-center gap-1">
                  <span>{planId === 'free' ? '升级获取额度' : '续订/升级'}</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>

            {/* 3. 通用算力积分 */}
            <div className="relative overflow-hidden rounded-2xl border border-success-line bg-gradient-to-b from-success-soft via-base to-base p-5 shadow-elevation-3 backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-success-line bg-success-soft text-success">
                      <Gem className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                        <span>通用算力积分</span>
                        <Badge className="text-micro bg-success-soft text-success border-success-line">永久不过期</Badge>
                      </div>
                      <span className="text-[11px] text-ink-muted">充值与签到奖励池</span>
                    </div>
                  </div>
                </div>
                <div className="my-2">
                  <div className="text-3xl font-black tracking-tight text-success font-mono">
                    {points.toLocaleString()} <span className="text-xs font-normal text-success">积分</span>
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed mt-2">
                  按需充值积分与每日打卡所得，订阅额度耗尽后无缝兜底消费，永久有效永不清零。
                </p>
              </div>
              <div className="pt-4 mt-3 border-t border-line-subtle flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCheckIn}
                  className={`text-xs font-semibold flex items-center gap-1 disabled:cursor-not-allowed ${
                    checkedInToday ? 'text-ink-subtle' : 'text-emerald-400 hover:text-emerald-300 cursor-pointer'
                  }`}
                  disabled={checkedInToday || checkinLoading}
                >
                  {checkinLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Gift className="size-3.5" />}
                  <span>{checkedInToday ? '今日积分已领' : (checkinLoading ? '签到中…' : '签到 +20 积分')}</span>
                </button>
                <Link href={localizedHref('/pricing#credit-packs', { pathname })} className="text-xs font-semibold text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer">
                  <span>充值积分包</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* 核心价值看板：额度与生图 / 生视频消耗映射矩阵 */}
          <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-4 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-line-subtle">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Sparkles className="size-4 text-brand" />
                  <span>额度与模型生成消耗映射矩阵</span>
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  明确每 1 额度的实际生产力，让您的每一笔订阅投资清晰透明、极具性价比。
                </p>
              </div>
              <Link href={localizedHref('/pricing', { pathname })}>
                <Button variant="outline" size="sm" className="gap-1 text-xs border-line bg-wash text-brand-hover hover:text-ink">
                  <span>查看套餐额度详情</span>
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>

            {/* 6 大生成能力消耗卡片 */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <ImageIcon className="size-3.5 text-info" />
                    <span>极速草图生图</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-info border-info-line">1 额度 / 张</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">FLUX.1 Schnell / SD 1.5 极速生成，1秒出图，灵感捕捉必备</p>
                <div className="mt-2 text-[11px] text-info font-mono">1,400 额度可产出 1,400 张图</div>
              </div>

              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <ImageIcon className="size-3.5 text-brand" />
                    <span>标清写实生图</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-brand-hover border-brand-line">2 额度 / 张</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">SDXL / Kolors 智绘高质量渲染，商业人像与电商海报优选</p>
                <div className="mt-2 text-[11px] text-brand font-mono">1,400 额度可产出 700 张图</div>
              </div>

              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <Sparkles className="size-3.5 text-purple-400" />
                    <span>SOTA 旗舰质感生图</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-purple-300 border-purple-500/30">4 额度 / 张</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">FLUX.1-dev / SD 3.5 / Ideogram 极细腻文字排版与质感微距</p>
                <div className="mt-2 text-[11px] text-purple-400/80 font-mono">1,400 额度可产出 350 张图</div>
              </div>

              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <Film className="size-3.5 text-warning" />
                    <span>短视频生成 (5s)</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-warning border-warning-line">20 额度 / 次</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">快手可灵 Kling 5s / MiniMax 海螺视频，高连贯性物理运镜</p>
                <div className="mt-2 text-[11px] text-warning font-mono">1,400 额度可生成 70 次视频</div>
              </div>

              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <Film className="size-3.5 text-danger" />
                    <span>超清专业视频 (10s)</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-danger border-danger-line">50 额度 / 次</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">Wan2.1 阿里万相 / Kling 10s 720P/1080P，电影级长镜头运镜</p>
                <div className="mt-2 text-[11px] text-danger font-mono">1,400 额度可生成 28 次长视频</div>
              </div>

              <div className="rounded-xl border border-line-subtle bg-scrim p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ink">
                    <Sparkles className="size-3.5 text-success" />
                    <span>动作克隆 / 唇形同步</span>
                  </div>
                  <Badge variant="outline" className="text-micro text-success border-success-line">15 额度 / 次</Badge>
                </div>
                <p className="text-[11px] text-ink-muted">LivePortrait 人脸动态迁移 / LipSync 语音数字人口型对齐</p>
                <div className="mt-2 text-[11px] text-success font-mono">1,400 额度可生成 93 次驱动</div>
              </div>
            </div>

            {/* 商业套餐额度产出对照表 */}
            <div className="overflow-x-auto rounded-xl border border-line-subtle bg-black/20">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-wash text-ink-muted font-semibold">
                  <tr>
                    <th className="px-4 py-3">订阅方案</th>
                    <th className="px-4 py-3">每月专属额度</th>
                    <th className="px-4 py-3 text-info">极速生图</th>
                    <th className="px-4 py-3 text-purple-400">旗舰质感生图</th>
                    <th className="px-4 py-3 text-warning">5s 短视频</th>
                    <th className="px-4 py-3 text-danger">10s 电影级长视频</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle text-ink font-mono text-[11px]">
                  <tr className="hover:bg-wash">
                    <td className="px-4 py-3 font-bold text-ink font-sans">Starter 创作者入门</td>
                    <td className="px-4 py-3 text-brand-hover font-bold">1,400 /月</td>
                    <td className="px-4 py-3">1,400 张</td>
                    <td className="px-4 py-3">350 张</td>
                    <td className="px-4 py-3">70 次</td>
                    <td className="px-4 py-3">28 次</td>
                  </tr>
                  <tr className="hover:bg-wash">
                    <td className="px-4 py-3 font-bold text-ink font-sans">Basic 创意达人</td>
                    <td className="px-4 py-3 text-brand-hover font-bold">3,500 /月</td>
                    <td className="px-4 py-3">3,500 张</td>
                    <td className="px-4 py-3">875 张</td>
                    <td className="px-4 py-3">175 次</td>
                    <td className="px-4 py-3">70 次</td>
                  </tr>
                  <tr className="hover:bg-wash">
                    <td className="px-4 py-3 font-bold text-ink font-sans">Plus 专业先锋</td>
                    <td className="px-4 py-3 text-brand-hover font-bold">7,000 /月</td>
                    <td className="px-4 py-3">7,000 张</td>
                    <td className="px-4 py-3">1,750 张</td>
                    <td className="px-4 py-3">350 次</td>
                    <td className="px-4 py-3">140 次</td>
                  </tr>
                  <tr className="hover:bg-wash bg-brand-soft">
                    <td className="px-4 py-3 font-bold text-ink font-sans flex items-center gap-1.5">
                      <span>Pro 顶级旗舰</span>
                      <Badge className="text-micro bg-brand-pressed text-brand-hover border-brand-ring">推荐</Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-hover font-bold">14,000 /月</td>
                    <td className="px-4 py-3">14,000 张</td>
                    <td className="px-4 py-3">3,500 张</td>
                    <td className="px-4 py-3">700 次</td>
                    <td className="px-4 py-3">280 次</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 卡密兑换模块 */}
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-3 backdrop-blur-md">
              <h2 className="text-base font-bold text-ink mb-2 flex items-center gap-2">
                <Ticket className="size-4 text-brand" />
                <span>卡密 / 算力兑换码快速激活</span>
              </h2>
              <p className="text-xs text-ink-muted mb-4">
                若您拥有官方赠送或活动获得的 16 位卡密兑换码，可在此处直接核销激活。
              </p>
              <form onSubmit={handleRedeemCoupon} className="flex gap-2.5">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="请输入卡密兑换码，例如：KOYO-ABCD-1234-EFGH"
                  className="flex-1 rounded-xl border border-line bg-scrim px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand font-mono uppercase"
                />
                <Button
                  type="submit"
                  disabled={couponLoading || !couponCode.trim()}
                  className="rounded-xl bg-surface-inverse text-ink-on-accent font-semibold text-xs px-5 hover:bg-surface-inverse cursor-pointer disabled:opacity-50"
                >
                  {couponLoading ? <Loader2 className="size-3.5 animate-spin" /> : '立即兑换'}
                </Button>
              </form>
            </div>

            <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-3 backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-ink">模型消耗计费标准</h3>
                  <Sparkles className="size-4 text-warning" />
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  平台支持 200+ 大模型，生图每次消耗 1–4 额度，会员享全站 LLM 无限免费畅聊。
                </p>
              </div>
              <Link href={localizedHref('/account?action=price-details', { pathname })}>
                <Button variant="ghost" size="sm" className="w-full justify-between mt-4 text-xs text-brand hover:text-brand-hover p-0">
                  <span>查看各模型详细扣费表</span>
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* 资产变动流水账本 */}
          <div className="rounded-2xl border border-line bg-base/90 shadow-elevation-4 overflow-hidden backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-line-subtle">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <History className="size-4 text-brand" />
                  <span>资产变动账本与明细</span>
                </h2>
                <p className="text-xs text-ink-subtle mt-0.5">
                  每日签到积分与生成任务消耗均实时记录在账；
                  <Link href={localizedHref('/benefits', { pathname })} className="text-warning hover:text-ink underline underline-offset-2">硬币获取与消耗明细</Link>
                  见权益中心。
                </p>
              </div>
              <div className="flex items-center gap-1 bg-well border border-line p-1 rounded-full self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setLedgerFilter('all')}
                  className={`h-7 text-xs rounded-full px-3 transition-all cursor-pointer ${
                    ledgerFilter === 'all' ? 'bg-surface-inverse text-ink-inverse font-bold shadow-elevation-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  全部记录
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerFilter('recharge')}
                  className={`h-7 text-xs rounded-full px-3 transition-all cursor-pointer ${
                    ledgerFilter === 'recharge' ? 'bg-surface-inverse text-ink-inverse font-bold shadow-elevation-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  奖励与到账
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerFilter('consume')}
                  className={`h-7 text-xs rounded-full px-3 transition-all cursor-pointer ${
                    ledgerFilter === 'consume' ? 'bg-surface-inverse text-ink-inverse font-bold shadow-elevation-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  任务消耗
                </button>
              </div>
            </div>

            <div className="p-0">
              {ledgerLoading ? (
                <div className="py-16 text-center text-xs text-ink-subtle flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin text-brand" />
                  <span>正在同步账本明细...</span>
                </div>
              ) : ledgerError ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">资产流水加载失败</p>
                    <p className="text-xs text-ink-muted mt-1">{ledgerError}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadLedger} className="gap-1.5 cursor-pointer">
                    <RotateCw className="size-3.5" />
                    <span>重试</span>
                  </Button>
                </div>
              ) : filteredLedger.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center text-ink-subtle">
                  <p className="text-sm font-medium text-ink">暂无资产流水记录</p>
                  <p className="text-xs text-ink-subtle mt-1">您完成每日登录打卡或运行模型后，明细将实时呈现在此处。</p>
                </div>
              ) : (
                <div className="divide-y divide-line-subtle">
                  {filteredLedger.map((item, idx) => {
                    const isPositive = String(item.delta || '').trim().startsWith('+');
                    return (
                      <div key={item.id || idx} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-wash transition-colors">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`flex size-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${
                            isPositive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-ink-muted'
                          }`}>
                            {isPositive ? '+' : '-'}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">{item.title || '资产变动'}</p>
                            <p className="text-[11px] text-ink-subtle font-mono mt-0.5">{item.time || item.created_at || '刚刚'}</p>
                          </div>
                        </div>
                        <div className={`shrink-0 whitespace-nowrap font-mono text-sm font-bold ${isPositive ? 'text-success' : 'text-ink'}`}>
                          {item.delta || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            await loadAccount();
            await loadDailyStatus();
            await loadLedger();
          }}
        />
      )}

    </div>
  );
}
