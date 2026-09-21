'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock,
  Coins,
  Gem,
  Gift,
  History,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import AuthModal from '@/components/AuthModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AVATAR_FRAMES, BENEFITS, BENEFIT_STATUS_LABELS } from '@/lib/benefits/catalog';

const BIZ_LABELS = {
  DAILY_LOGIN: '每日登录打卡',
  FEEDBACK_REWARD: '建议 / 报错 / 漏洞被采纳',
  POST_COIN_TIP: '社区作品投币',
  BENEFIT_REDEEM: '兑换站内权益',
  // 硬币兑换算力已于 2026-09-21 下架，历史流水仍要能读出中文标签
  EXCHANGE_CREDITS: '兑换创作算力（已停）',
};

const KIND_ICONS = {
  priority: Zap,
  avatar_frame: BadgeCheck,
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

function remainingHours(until) {
  if (!until) return 0;
  const diff = new Date(until).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 3600000) : 0;
}

export default function BenefitsClient() {
  const [user, setUser] = useState(null);
  const [coins, setCoins] = useState(0);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [redeeming, setRedeeming] = useState(null);
  const [wearing, setWearing] = useState(false);
  const [message, setMessage] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) setUser(data.user);
    } catch {}
  }, []);

  const loadWallet = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await fetch('/api/financial/currency/wallet?limit=50', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setCoins(Number(data.wallet?.availableBalance || 0));
      if (Array.isArray(data.recentTransactions)) setLedger(data.recentTransactions);
    } catch {} finally {
      setLedgerLoading(false);
    }
  }, []);

  const loadDailyStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/financial/currency/daily-login', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setDailyClaimed(Boolean(data.claimed));
    } catch {}
  }, []);

  useEffect(() => {
    loadProfile();
    loadWallet();
    loadDailyStatus();
  }, [loadProfile, loadWallet, loadDailyStatus]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const ownedFrames = user?.avatarFrames || [];
  const wornFrame = user?.avatarFrame || null;
  const boostLeft = remainingHours(user?.priorityUntil);

  const requireAuth = () => {
    if (user) return false;
    setShowAuthModal(true);
    return true;
  };

  async function claimDaily() {
    if (requireAuth() || claiming || dailyClaimed) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/financial/currency/daily-login', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.amount > 0) {
        setMessage(`已领取今日登录奖励 ${data.amount} 枚硬币`);
        setDailyClaimed(true);
      } else if (res.ok) {
        setMessage('今日登录奖励已领取，明天再来');
        setDailyClaimed(true);
      } else {
        setMessage(data.error || '领取失败，请稍后重试');
      }
      await loadWallet();
    } catch {
      setMessage('网络异常，领取失败');
    } finally {
      setClaiming(false);
    }
  }

  async function redeem(benefit) {
    if (requireAuth() || redeeming) return;
    if (coins < benefit.coins) {
      setMessage(`硬币不足，本次需要 ${benefit.coins} 枚，当前 ${coins.toFixed(2)} 枚`);
      return;
    }
    setRedeeming(benefit.id);
    setMessage('');
    try {
      const res = await fetch('/api/financial/currency/benefits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ benefitId: benefit.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || '兑换失败，请稍后重试');
      } else if (benefit.kind === 'priority') {
        setMessage(`加速卡已激活，优先出图有效至 ${formatTime(data.priorityUntil)}`);
      } else {
        setMessage(`${AVATAR_FRAMES[benefit.frame]?.label || '头像框'}已永久拥有并佩戴`);
      }
      await Promise.all([loadWallet(), loadProfile()]);
    } catch {
      setMessage('网络异常，兑换未完成');
    } finally {
      setRedeeming(null);
    }
  }

  async function wear(frame) {
    if (requireAuth() || wearing) return;
    setWearing(true);
    try {
      const res = await fetch('/api/user/avatar-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? data.message || '已更新' : data.error || '设置失败');
      if (res.ok) await loadProfile();
    } catch {
      setMessage('网络异常，设置失败');
    } finally {
      setWearing(false);
    }
  }

  const filteredLedger = ledger.filter((item) => {
    if (ledgerFilter === 'all') return true;
    return ledgerFilter === 'earn' ? item.direction === 'CREDIT' : item.direction === 'DEBIT';
  });

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <StudioHeader title="硬币权益中心" subtitle="兑换优先出图与身份权益，查看硬币的每一笔来处与去处" />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {message && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-2xl border border-warning-line bg-warning-soft px-5 py-3 text-label font-semibold text-warning animate-in fade-in"
          >
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="text-ink-muted hover:text-ink cursor-pointer">✕</button>
          </div>
        )}

        {/* 余额与唯二获取渠道 */}
        <section className="rounded-2xl border border-warning-line bg-gradient-to-b from-warning-soft via-well to-base p-6 shadow-elevation-3">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-label font-semibold uppercase tracking-widest text-warning">硬币余额</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-display font-black tracking-tight text-warning font-mono">{coins.toFixed(2)}</span>
                <span className="text-label text-warning">枚 🪙</span>
              </div>
              <p className="mt-2 text-label text-ink-muted">硬币不可充值、不可提现、不可在用户间转让，只能靠下面两种方式积累。</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={claimDaily}
              disabled={!user || dailyClaimed || claiming}
              className={`gap-1.5 border-warning-line cursor-pointer disabled:cursor-not-allowed ${
                dailyClaimed ? 'bg-warning-soft text-ink-muted' : 'bg-warning-soft text-warning hover:text-ink active:scale-95'
              }`}
            >
              {claiming ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-body">🪙</span>}
              <span>{dailyClaimed ? '今日已领' : '今日打卡领 1 枚'}</span>
            </Button>
          </div>

          <div className="mt-5 pt-5 border-t border-line grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-scrim p-4">
              <div className="flex items-center gap-2 text-label font-bold text-ink">
                <Gift className="size-4 text-warning" />
                <span>渠道一 · 每日登录</span>
              </div>
              <p className="mt-1.5 text-caption text-ink-muted leading-relaxed">
                每天登录后来这里点一次打卡，固定到账 1 枚，北京时间 00:00 刷新。
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-scrim p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-label font-bold text-ink">
                  <ShieldCheck className="size-4 text-success" />
                  <span>渠道二 · 有效提交</span>
                </div>
                <Link href="/account?action=feedback" className="text-micro font-semibold text-brand hover:text-brand-hover flex items-center gap-0.5">
                  去提交 <ArrowUpRight className="size-3" />
                </Link>
              </div>
              <p className="mt-1.5 text-caption text-ink-muted leading-relaxed">
                提交网站报错、体验改善建议或安全漏洞，经人工审核采纳后按有效性发放 2–20 枚。
              </p>
            </div>
          </div>
        </section>

        {/* 加速卡状态 */}
        {boostLeft > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-line bg-brand-soft px-5 py-3">
            <div className="flex items-center gap-2 text-label text-ink">
              <Zap className="size-4 text-brand" />
              <span className="font-semibold">优先出图生效中</span>
              <span className="text-ink-muted">剩余约 {boostLeft} 小时，期间你的生成任务在出站队列里优先执行。</span>
            </div>
            <span className="text-label font-mono text-brand-hover">{formatTime(user?.priorityUntil)}</span>
          </div>
        )}

        {/* 权益兑换 */}
        <section className="rounded-2xl border border-line bg-scrim p-6 shadow-elevation-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-warning" />
            <h2 className="text-section-title font-bold text-ink">硬币可以兑换什么</h2>
          </div>
          <p className="text-label text-ink-muted mb-5">下列兑换全部真实生效，点击后立即到账，可在下方明细中核对每一笔消耗。</p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => {
              const Icon = KIND_ICONS[benefit.kind] || Gem;
              const alreadyOwned = benefit.kind === 'avatar_frame' && ownedFrames.includes(benefit.frame);
              const affordable = coins >= benefit.coins;
              return (
                <div
                  key={benefit.id}
                  className="relative rounded-2xl border border-line bg-scrim p-5 flex flex-col justify-between gap-4 hover:border-warning-line transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="flex size-10 items-center justify-center rounded-xl border border-warning-line bg-warning-soft text-warning">
                        <Icon className="size-5" />
                      </span>
                      <Badge variant="outline" className="text-micro border-line text-ink-muted">
                        {BENEFIT_STATUS_LABELS[benefit.kind]}
                      </Badge>
                    </div>
                    <h3 className="text-body font-bold text-ink">{benefit.title}</h3>
                    <p className="mt-1.5 text-caption text-ink-muted leading-relaxed">{benefit.summary}</p>
                  </div>
                  <div className="pt-3 border-t border-line-subtle flex items-center justify-between gap-2">
                    <span className="font-mono text-body font-bold text-warning">🪙 {benefit.coins}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!user || alreadyOwned || !affordable || !!redeeming}
                      onClick={() => redeem(benefit)}
                      className="text-caption rounded-xl px-3 border-warning-line text-warning hover:bg-warning-soft cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {redeeming === benefit.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : alreadyOwned ? (
                        <span className="flex items-center gap-1"><Check className="size-3" />已拥有</span>
                      ) : affordable ? (
                        '立即兑换'
                      ) : (
                        '硬币不足'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 头像框佩戴管理 */}
        {ownedFrames.length > 0 && (
          <section className="rounded-2xl border border-line bg-scrim p-6 shadow-elevation-3">
            <div className="flex items-center gap-2 mb-1">
              <BadgeCheck className="size-4 text-brand" />
              <h2 className="text-section-title font-bold text-ink">我的头像框</h2>
            </div>
            <p className="text-label text-ink-muted mb-4">头像框永久拥有，随时切换佩戴；个人主页、顶栏头像与个人中心侧栏同步生效。</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={wearing || !wornFrame}
                onClick={() => wear(null)}
                className={`rounded-xl border px-3.5 py-2 text-label font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                  !wornFrame ? 'border-brand-ring bg-wash-strong text-ink' : 'border-line bg-wash text-ink-muted hover:text-ink'
                }`}
              >
                不佩戴
              </button>
              {ownedFrames.map((frame) => (
                <button
                  key={frame}
                  type="button"
                  disabled={wearing || wornFrame === frame}
                  onClick={() => wear(frame)}
                  className={`flex items-center gap-2 rounded-xl border bg-wash px-3.5 py-2 text-label font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    wornFrame === frame ? 'border-brand-ring text-ink bg-wash-strong' : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className={`size-5 rounded-full bg-overlay ${AVATAR_FRAMES[frame]?.ringClasses || ''}`} />
                  <span>{AVATAR_FRAMES[frame]?.label || frame}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 硬币获取与消耗明细 */}
        <section className="rounded-2xl border border-line bg-scrim shadow-elevation-3 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 border-b border-line-subtle">
            <div>
              <h2 className="text-section-title font-bold text-ink flex items-center gap-2">
                <History className="size-4 text-brand" />
                <span>硬币获取与消耗明细</span>
              </h2>
              <p className="text-label text-ink-subtle mt-0.5">只统计硬币账户自身的进出，按发生时间倒序。</p>
            </div>
            <div className="flex items-center gap-1 bg-well border border-line p-1 rounded-full self-start sm:self-auto">
              {[
                { id: 'all', label: '全部' },
                { id: 'earn', label: '获取' },
                { id: 'spend', label: '消耗' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLedgerFilter(tab.id)}
                  className={`h-7 text-label rounded-full px-3 transition-colors cursor-pointer ${
                    ledgerFilter === tab.id ? 'bg-surface-inverse text-ink-inverse font-bold shadow-elevation-1' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {ledgerLoading ? (
            <div className="py-16 text-center text-label text-ink-subtle flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" />
              <span>正在同步硬币明细…</span>
            </div>
          ) : !user ? (
            <p className="py-16 text-center text-label text-ink-subtle">登录后查看你的硬币明细。</p>
          ) : filteredLedger.length === 0 ? (
            <p className="py-16 text-center text-label text-ink-subtle">
              {ledger.length === 0 ? '还没有硬币流水，先完成今日打卡或提交一条建议吧。' : '该筛选下暂无记录。'}
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {filteredLedger.map((item, idx) => {
                const earned = item.direction === 'CREDIT';
                return (
                  <li key={item.id || idx} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-wash transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex size-8 shrink-0 items-center justify-center rounded-xl border text-label font-bold ${
                        earned ? 'border-success-line bg-success-soft text-success' : 'border-line bg-wash text-ink-muted'
                      }`}>
                        {earned ? '+' : '−'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-label font-semibold text-ink truncate">{BIZ_LABELS[item.bizType] || item.description || '硬币变动'}</p>
                        <p className="text-caption text-ink-subtle font-mono mt-0.5 truncate">
                          {formatTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className={`font-mono text-body font-bold ${earned ? 'text-success' : 'text-ink'}`}>
                        {earned ? '+' : '−'}{Number(item.amount).toFixed(2)} <span className="text-caption font-normal">枚</span>
                      </div>
                      {item.balanceAfter !== null && (
                        <div className="text-caption text-ink-subtle font-mono">余 {Number(item.balanceAfter).toFixed(2)}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 规则与去向 */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-scrim p-6 shadow-elevation-2">
            <div className="flex items-center gap-2 text-body font-bold text-ink mb-3">
              <Coins className="size-4 text-warning" />
              <span>硬币规则</span>
            </div>
            <ul className="space-y-2.5 text-label text-ink-muted leading-relaxed">
              <li>· 唯二获取：每日登录 1 枚；有效提交经人工审核后发放 2–20 枚。</li>
              <li>· 不可充值、不可提现、不可在用户间转让；兑换一旦完成不予返还。</li>
              <li>· 永久有效，不随月度或年度重置清零。</li>
              <li>· 给社区作品投币属于消耗：投出的硬币不会成为作者的收入，同一作品每人上限 2 枚。</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-scrim p-6 shadow-elevation-2">
            <div className="flex items-center gap-2 text-body font-bold text-ink mb-3">
              <Clock className="size-4 text-brand" />
              <span>硬币与算力的分工</span>
            </div>
            <p className="text-label text-ink-muted leading-relaxed">
              生图、生视频消耗的是<span className="text-ink"> 算力积分</span>与订阅额度，只能通过会员套餐和算力包获得，
              <span className="text-ink">硬币不能兑换算力</span>；硬币只负责优先出图加速卡、永久头像框与社区作品投币。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/credits">
                <Button variant="outline" size="sm" className="text-caption rounded-xl border-line cursor-pointer">
                  资产与额度总览
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm" className="text-caption text-brand hover:text-brand-hover cursor-pointer">
                  会员与算力包 <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            await Promise.all([loadProfile(), loadWallet(), loadDailyStatus()]);
          }}
        />
      )}
    </div>
  );
}
