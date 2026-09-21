'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap,
  Gem,
  Crown,
  ArrowUpRight,
  Gift,
  Plus,
  Ticket,
  History,
  Loader2,
  Sparkles,
  Coins,
  Layers,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  BookOpen,
  HelpCircle,
  ShoppingBag,
  ShieldCheck,
  Award,
  Clock,
  Flame,
  Check,
  Package,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import AuthModal from '@/components/AuthModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CreditsClient() {
  const [user, setUser] = useState(null);
  const [kcoins, setKcoins] = useState(0);
  const [subCredits, setSubCredits] = useState(0);
  const [subExpiresAt, setSubExpiresAt] = useState(null);
  const [points, setPoints] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [planName, setPlanName] = useState('免费体验版');
  const [planId, setPlanId] = useState('free');
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [message, setMessage] = useState('');

  // 页面顶级 Tab：'overview' (总览与账本), 'rewards' (专属奖品兑换), 'rules' (K币规则手册)
  const [activeTab, setActiveTab] = useState('overview');

  // 兑换码内联表单
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // 每日登录打卡状态
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claimingLogin, setClaimingLogin] = useState(false);

  const loadAccount = async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setPlanName(data.entitlements?.planName || (data.user.role === 'admin' ? '管理特权' : '免费体验版'));
          setPlanId(data.entitlements?.planId || 'free');

          // K 币（网站专属代币）
          const userKcoins = data.entitlements?.currencyWallet?.availableBalance ?? data.user.kcoins ?? 0;
          setKcoins(Number(userKcoins) || 0);

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
      if (res.ok) {
        const data = await res.json();
        setDailyClaimed(Boolean(data.claimed));
        if (data.balance !== undefined) setKcoins(Number(data.balance));
      }
    } catch {}
  };

  const loadLedger = async () => {
    try {
      setLedgerLoading(true);
      const res = await fetch('/api/financial/credits/ledger');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ledger)) {
          setLedger(data.ledger);
        }
      }
    } catch {
      // 容错降级
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
    loadDailyStatus();
    loadLedger();
  }, []);

  // 领取每日登录 1 枚 K 币
  const handleClaimDailyKCoin = async () => {
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
        setMessage(data.message || '🎉 成功领取今日登录奖励 1 枚 K 币！');
        setDailyClaimed(true);
        setKcoins(Number(data.balance || kcoins + 1));
        await loadLedger();
      } else {
        setMessage(data.error || '今日登录奖励已领取');
        setDailyClaimed(true);
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
    try {
      const res = await fetch('/api/financial/credits/checkin', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message || '签到成功，+20 积分已入账！');
        await loadAccount();
        await loadLedger();
      } else {
        setMessage(data.error || '今日已完成签到，请明日再来');
      }
    } catch {
      setMessage('网络连接异常，签到失败');
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

  // 判断今日积分签到
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const checkedInToday = ledger.some(
    (item) => (item.title?.includes('签到') || item.type === 'checkin') &&
              (item.time?.includes(todayStr) || item.time?.includes(new Date().toLocaleDateString()))
  );

  const filteredLedger = ledger.filter(
    (item) => ledgerFilter === 'all' || (ledgerFilter === 'recharge' ? item.type !== 'task' : item.type === 'task')
  );

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col selection:bg-warning-soft">
      <StudioHeader title="创作额度与专属代币" subtitle="管理 K 币、月度专属额度与算力积分" />

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
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">资产与货币中心</span>
              <Badge variant="outline" className="text-micro border-warning-line text-warning bg-warning-soft">
                1 K币 = 1 USD (美元锚定)
              </Badge>
              <Badge variant="outline" className="text-micro border-success-line text-success bg-success-soft">
                不可充值 · 纯激励生态
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">我的创作资产与专属 K 币</h1>
            <p className="text-xs text-ink-muted mt-1">
              涵盖网站专属社交货币（K 币）、订阅核心用户资产（月度专属额度）与通用算力积分。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 领取今日 1 枚 K 币打卡按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClaimDailyKCoin}
              disabled={dailyClaimed || claimingLogin}
              className={`gap-1.5 border-warning-line ${
                dailyClaimed
                  ? 'bg-warning-soft text-ink-muted border-line'
                  : 'bg-gradient-to-r from-warning-soft to-yellow-500/20 text-warning hover:bg-warning-soft active:scale-95'
              }`}
            >
              <span className="text-sm">🪙</span>
              <span>{dailyClaimed ? '今日已领 1 K币' : '今日打卡领 1 K币'}</span>
            </Button>

            {/* 会员订阅升级入口 */}
            <Link href="/pricing">
              <Button variant="outline" size="sm" className="gap-1.5 border-brand-line bg-brand-soft text-brand-hover hover:bg-brand-pressed active:scale-95">
                <Crown className="size-3.5 text-warning" />
                <span>{planId === 'free' ? '开通商业订阅' : '管理订阅套餐'}</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* 核心 Tab 导航条 */}
        <div className="flex items-center gap-2 border-b border-line mb-8 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-surface-inverse text-ink-inverse shadow-elevation-2 shadow-white/10'
                : 'text-ink-muted hover:text-ink hover:bg-wash'
            }`}
          >
            <Coins className="size-4 text-warning" />
            <span>资产与额度总览</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rewards')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'rewards'
                ? 'bg-warning text-ink-on-accent shadow-elevation-2 shadow-warning-soft'
                : 'text-ink-muted hover:text-warning hover:bg-warning-soft'
            }`}
          >
            <ShoppingBag className="size-4" />
            <span>专属奖品兑换</span>
            <span className="text-micro px-1.5 py-0.2 rounded-full bg-warning-soft text-warning border border-warning-line">开发中</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-brand-active text-ink-on-accent shadow-elevation-2 shadow-brand-soft'
                : 'text-ink-muted hover:text-brand-hover hover:bg-brand-soft'
            }`}
          >
            <BookOpen className="size-4" />
            <span>K 币规则与生态手册</span>
          </button>
        </div>

        {/* ======================= TAB 1: 资产总览 ======================= */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-base">
            {/* 三元资产卡片矩阵 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* 1. K 币账户 (网站专属代币，不可充值，参考 B 站硬币) */}
              <div className="relative overflow-hidden rounded-2xl border border-warning-line bg-gradient-to-b from-warning-soft via-well to-base p-5 shadow-elevation-3 backdrop-blur-md flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-xl border border-warning-line bg-warning-soft text-warning text-base">
                        🪙
                      </span>
                      <div>
                        <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                          <span>专属互动 K 币</span>
                          <Badge className="text-micro bg-warning-soft text-warning border-warning-line">不可充值</Badge>
                        </div>
                        <span className="text-[11px] text-warning">与美元锚定 (1 K币 = 1 USD)</span>
                      </div>
                    </div>
                  </div>
                  <div className="my-2">
                    <div className="text-3xl font-black tracking-tight text-warning font-mono flex items-baseline gap-2">
                      <span>{kcoins.toLocaleString()}</span>
                      <span className="text-xs font-normal text-warning">枚 K 币</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed mt-2">
                    网站独有社交互动硬币，仅通过每日登录、优质作品获投产出。用于社区投币支持与站内专属周边兑换。
                  </p>
                </div>
                <div className="pt-4 mt-3 border-t border-line-subtle flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setActiveTab('rules')}
                    className="text-xs font-semibold text-warning hover:text-warning flex items-center gap-1 cursor-pointer"
                  >
                    <span>使用规则手册</span>
                    <ArrowUpRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('rewards')}
                    className="text-xs font-semibold text-ink hover:text-ink flex items-center gap-1 cursor-pointer"
                  >
                    <span>专属奖品区</span>
                    <ArrowUpRight className="size-3.5" />
                  </button>
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
                  <Link href="/pricing" className="text-xs font-semibold text-brand hover:text-brand-hover flex items-center gap-1">
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
                    className={`text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                      checkedInToday ? 'text-ink-subtle' : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                    disabled={checkedInToday}
                  >
                    <Gift className="size-3.5" />
                    <span>{checkedInToday ? '今日积分已领' : '签到 +20 积分'}</span>
                  </button>
                  <Link href="/pricing#credit-packs" className="text-xs font-semibold text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer">
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
                <Link href="/pricing">
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
                <Link href="/account?action=price-details">
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
                  <p className="text-xs text-ink-subtle mt-0.5">每日登录赠送 K 币、签到积分与任务消耗均实时记录在账。</p>
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
        )}

        {/* ======================= TAB 2: 站内专属奖品兑换专区 ======================= */}
        {activeTab === 'rewards' && (
          <div className="space-y-6 animate-in fade-in duration-base">
            {/* 顶栏公告 */}
            <div className="rounded-2xl border border-warning-line bg-gradient-to-r from-warning-soft via-surface to-base p-6 shadow-elevation-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🎁</span>
                    <h2 className="text-lg font-bold text-ink">站内专属奖品兑换中心</h2>
                    <Badge className="bg-warning-soft text-warning border-warning-line text-micro">开发筹备中</Badge>
                  </div>
                  <p className="text-xs text-ink leading-relaxed max-w-2xl">
                    K 币是全站不可充值的专属高价值硬币（底层与美元 1:1 锚定）。您可以通过日常登录打卡、社区发布优质作品获其他创作者投币积累 K 币。积累的 K 币可在此专区免费兑换平台限量实体周边、专属特权与限定数字勋章！
                  </p>
                </div>
                <div className="shrink-0 text-right hidden sm:block">
                  <div className="text-xs text-ink-muted">当前我的 K 币余额</div>
                  <div className="text-2xl font-black text-warning font-mono mt-0.5">
                    🪙 {kcoins} <span className="text-xs font-normal text-ink-muted">枚</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-line flex items-center gap-2 text-xs text-warning">
                <Clock className="size-4 shrink-0 text-warning" />
                <span>仓储与物流通道正在深度打通中，所有奖品预计将于下一版本正式开放兑换，敬请期待！</span>
              </div>
            </div>

            {/* 6 大奖品卡片展示 */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* 奖品 1 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft border border-warning-soft text-3xl mb-4 group-hover:scale-110 transition-transform">
                    🏅
                  </div>
                  <h3 className="text-sm font-bold text-ink">平台限定金属创作者徽章</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    精工锌合金铸造，浮雕电镀真金涂层，刻有创作者唯一 6 位 UID，极具永久收藏价值。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 30 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>

              {/* 奖品 2 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 text-3xl mb-4 group-hover:scale-110 transition-transform">
                    🖥️
                  </div>
                  <h3 className="text-sm font-bold text-ink">赛博霓虹定制超大防滑桌垫</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    900×400mm 超大加厚锁边桌面垫，微织物顺滑表面，支持精密鼠标追踪与防水防污。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 50 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>

              {/* 奖品 3 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-soft text-3xl mb-4 group-hover:scale-110 transition-transform">
                    ✨
                  </div>
                  <h3 className="text-sm font-bold text-ink">全站专属动态流光头像框 (永久)</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    站内独家粒子环绕流光特效，在社区广场、作品详情与个人主页均享有独特尊贵标识。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 20 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>

              {/* 奖品 4 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-success-soft border border-success-soft text-3xl mb-4 group-hover:scale-110 transition-transform">
                    🚀
                  </div>
                  <h3 className="text-sm font-bold text-ink">VIP 极速并行生成加速卡 (30天)</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    解锁并发队列专属通道，免去排队困扰，生图、生视频任务极速出结果，创作不等待。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 60 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>

              {/* 奖品 5 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft border border-danger-soft text-3xl mb-4 group-hover:scale-110 transition-transform">
                    👕
                  </div>
                  <h3 className="text-sm font-bold text-ink">重磅纯棉程序员极客卫衣</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    420g 重磅纯棉落肩廓形，定制赛博 AI 丝网印刷图案，透气保暖，舒适耐磨。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 99 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>

              {/* 奖品 6 */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-base/90 p-5 flex flex-col justify-between group hover:border-warning-line transition-all">
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-warning-soft text-warning border border-warning-line text-micro font-bold">
                  🚧 开发中
                </div>
                <div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-3xl mb-4 group-hover:scale-110 transition-transform">
                    📦
                  </div>
                  <h3 className="text-sm font-bold text-ink">SOTA 旗舰大模型神秘盲盒</h3>
                  <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                    开启即随机获得前沿闭门测试模型内测资格、独家商业微调权重或大额免额度调用券。
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-warning">
                    🪙 15 K币
                  </div>
                  <Button size="xs" disabled className="bg-wash-press text-ink-muted text-[11px] cursor-not-allowed">
                    敬请期待
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB 3: K 币规则手册 ======================= */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-in fade-in duration-base">
            {/* 顶栏大卡片 */}
            <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-3">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-warning-soft text-warning border border-warning-line text-xl">
                  📖
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink">K 币生态全规则明细手册</h2>
                  <p className="text-xs text-ink-muted">深入了解网站专属货币 K 币的价值锚定、获得渠道、投币机制与消耗权益。</p>
                </div>
              </div>
            </div>

            {/* 核心规则细则 */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* 规则 1：美元锚定与货币定位 */}
              <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-2">
                <div className="flex items-center gap-2 text-warning font-bold text-sm mb-3">
                  <ShieldCheck className="size-4" />
                  <span>1. 货币定位与美元价值锚定</span>
                </div>
                <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-warning font-bold">•</span>
                    <span><strong>网站专属货币</strong>：K 币是本平台唯一定位的社区互动与高价值激励专属硬币，与法币资产、会员订阅额度和通用算力积分完全隔离。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning font-bold">•</span>
                    <span><strong>底层与美元 1:1 锚定</strong>：平台金融核心将 <strong>1 K币 恒定锚定为 1 美元 (USD)</strong> 的高价值基准。系统底层采用国际浮动汇率作为内部结算单位，保障代币的真实购买力与奖品价值。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-warning font-bold">•</span>
                    <span><strong>对外纯净展示</strong>：为保障社区极简体验，前台对外不直接暴露汇率浮动算法，统一展示整数枚数。</span>
                  </li>
                </ul>
              </div>

              {/* 规则 2：不可充值与防刷机制 */}
              <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-2">
                <div className="flex items-center gap-2 text-danger font-bold text-sm mb-3">
                  <Flame className="size-4" />
                  <span>2. 纯激励属性与彻底不可充值</span>
                </div>
                <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-danger font-bold">•</span>
                    <span><strong>禁止法币直接充值</strong>：全站彻底关闭并通过金融内核阻断任何现金直接购买 K 币的通道，杜绝金融投机、炒币与洗钱风险。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger font-bold">•</span>
                    <span><strong>不可法币提现</strong>：K 币仅作为站内社交荣誉与奖品兑换凭证，不支持反向提现为法定货币或转让。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-danger font-bold">•</span>
                    <span><strong>纯粹激励生态</strong>：K 币的全部发行均来自于用户的日常活跃、高质量内容创作以及官方活动嘉奖。</span>
                  </li>
                </ul>
              </div>

              {/* 规则 3：获取方式 (参考 B 站硬币) */}
              <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-2">
                <div className="flex items-center gap-2 text-success font-bold text-sm mb-3">
                  <Gift className="size-4" />
                  <span>3. 获取方式（参考 B 站硬币机制）</span>
                </div>
                <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-success font-bold">•</span>
                    <span><strong>每日登录奖励</strong>：每天登录网站并点击用户头像或 K 币胶囊，系统即自动向您的钱包发放 <strong>1 枚 K 币</strong>，伴随金币升腾与光圈特效（每日限 1 次，北京时间 00:00 刷新）。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success font-bold">•</span>
                    <span><strong>社区作品获投</strong>：发布您生成的精美图像、视频或创作工作流。当其他创作者对您的作品进行投币时，所投的 K 币将 100% 实时结算入您的 K 币账户。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success font-bold">•</span>
                    <span><strong>官方赛事与活动</strong>：定期参与官方举办的 Prompt 竞技场、创意挑战赛等，可赢取高额 K 币嘉奖。</span>
                  </li>
                </ul>
              </div>

              {/* 规则 4：使用与投币规范 */}
              <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-2">
                <div className="flex items-center gap-2 text-brand font-bold text-sm mb-3">
                  <Coins className="size-4" />
                  <span>4. 社区投币与消耗规范</span>
                </div>
                <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-brand font-bold">•</span>
                    <span><strong>投币面额限制</strong>：单次投币操作仅支持投掷 <strong>1 币</strong>（心意支持）或 <strong>2 币</strong>（强力力挺），单次最高不得超过 2 币。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand font-bold">•</span>
                    <span><strong>单作品累计上限</strong>：每位用户对同一个社区作品最多累计投掷 <strong>2 枚 K 币</strong>，投满后无法继续对该作投币，有效防止恶意刷票。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand font-bold">•</span>
                    <span><strong>严禁自我投币</strong>：作者无法为自己名下发布的作品投币，确保投币数据的真实与公允。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand font-bold">•</span>
                    <span><strong>站内礼品兑换</strong>：消耗 K 币可在“专属奖品兑换专区”兑换限定实物周边与数字特权（当前开发筹备中）。</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 常见问题 FAQ */}
            <div className="rounded-2xl border border-line bg-base/90 p-6 shadow-elevation-3">
              <div className="flex items-center gap-2 text-ink font-bold text-sm mb-4">
                <HelpCircle className="size-4 text-brand" />
                <span>常见问题解答 FAQ</span>
              </div>
              <div className="space-y-4 text-xs text-ink leading-relaxed divide-y divide-line-subtle">
                <div className="pt-2 first:pt-0">
                  <p className="font-bold text-ink mb-1">Q: 我的 K 币会过期或者被清零吗？</p>
                  <p className="text-ink-muted">A: 不会。K 币作为您的专属荣誉资产，永久有效，不随月度或年度重置。</p>
                </div>
                <div className="pt-3">
                  <p className="font-bold text-ink mb-1">Q: 为什么我无法充值 K 币？</p>
                  <p className="text-ink-muted">A: 为保障社区创作生态健康，K 币被设定为专属不可充值货币。若您需要生成更多图片或视频，请前往购买“商业会员订阅”（享受每月数千额度）或按需购买“通用算力积分包”。</p>
                </div>
                <div className="pt-3">
                  <p className="font-bold text-ink mb-1">Q: 兑换奖品时需要支付运费吗？</p>
                  <p className="text-ink-muted">A: 站内专属实体周边奖品正式开放后，中国大陆地区支持包邮免费寄送，海外及港澳台地区运费规则将在功能上线时公布。</p>
                </div>
              </div>
            </div>
          </div>
        )}
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
