'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Crown, Sparkles, Zap, ShieldCheck, ArrowRight, Loader2, RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function MembershipTab() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // 加载数据：订阅信息、使用量信息、历史订单
  const loadData = async () => {
    try {
      setLoading(true);
      const [subRes, usageRes, ordersRes] = await Promise.all([
        fetch('/api/billing/subscription', { cache: 'no-store' }),
        fetch('/api/billing/usage', { cache: 'no-store' }),
        fetch('/api/billing/orders/my', { cache: 'no-store' }),
      ]);

      if (subRes.ok) {
        const sData = await subRes.json();
        setSubscription(sData.subscription || null);
        setEntitlements(sData.entitlements || null);
      }

      if (usageRes.ok) {
        const uData = await usageRes.json();
        setUsageData(uData);
      }

      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(Array.isArray(oData.orders) ? oData.orders : []);
      }
    } catch (err) {
      console.error('加载订阅与使用量数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopy = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentPlanId = entitlements?.planId || (subscription && ['active', 'trialing'].includes(subscription.status) ? subscription.plan_id : 'free');
  const isPaid = currentPlanId && currentPlanId !== 'free';
  const planName = entitlements?.planName || (isPaid ? '创作者会员' : '基础体验版 (FREE)');
  const periodEnd = subscription?.current_period_end 
    ? new Date(subscription.current_period_end).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : (isPaid ? '有效运作中' : '永久有效');

  // 计算使用量指标
  const totalCredits = usageData?.usage?.credits ?? (entitlements?.tierCredits || 50);
  const ledger = usageData?.ledger || [];
  const recentConsumed = ledger
    .filter((item) => item.amount < 0)
    .reduce((acc, item) => acc + Math.abs(item.amount), 0);
  const displayConsumed = recentConsumed > 0 ? recentConsumed : 0;
  const estimatedQuota = isPaid ? (totalCredits + displayConsumed) : (totalCredits > 100 ? totalCredits : 100);
  const usedPercent = Math.min(100, Math.max(0, Math.round((displayConsumed / (estimatedQuota || 1)) * 100)));

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-base">
      {/* 1. 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">MEMBERSHIP & QUOTA</span>
            <Badge variant="accent" className="text-micro bg-warning/10 text-warning border-warning/30">
              {isPaid ? 'VIP 会员生效中' : '基础免费版'}
            </Badge>
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-ink flex items-center gap-2.5">
            <span>订阅概况与套餐使用量</span>
            <button
              type="button"
              onClick={loadData}
              title="刷新数据"
              className="text-ink-subtle hover:text-ink transition-colors cursor-pointer"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </h1>
          <p className="mt-1 text-xs text-ink-muted">
            查看您的当前订阅特权、周期算力额度消耗与过往充值记录。
          </p>
        </div>

        {/* 唯一方案入口：统一前往会员方案页 */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/pricing#plans" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-bold text-ink-inverse shadow-elevation-2 transition-[background-color,color,transform] duration-base hover:brightness-110 active:scale-95">
            <Crown className="size-4 fill-ink-inverse text-ink-inverse" />
            <span>{isPaid ? '升级/续订方案' : '查看会员方案'}</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-warning" />
          <span className="text-xs text-ink-muted font-medium">正在读取订阅资产与用量明细…</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* 2. 表格一：当前订阅概况表 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink tracking-tight flex items-center gap-2">
                <Crown className="size-4 text-warning" />
                <span>当前订阅概况</span>
              </h2>
              <span className="text-xs text-ink-subtle">按周期自动同步结算权益</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-base/90 shadow-elevation-1 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-ink">
                  <thead className="bg-wash text-ink-muted border-b border-line-subtle font-medium uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">套餐版本</th>
                      <th className="py-3 px-4">订阅状态</th>
                      <th className="py-3 px-4">计费周期</th>
                      <th className="py-3 px-4">到期时间 / 刷新日</th>
                      <th className="py-3 px-4">并发算力特权</th>
                      <th className="py-3 px-4">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    <tr className="hover:bg-wash transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-ink flex items-center gap-2">
                        <span className="size-2 rounded-full bg-success animate-pulse" />
                        <span>{planName}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-bold ${
                          isPaid 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-zinc-800 text-ink-muted border border-white/10'
                        }`}>
                          <CheckCircle2 className="size-3" />
                          {isPaid ? '已生效 · 尊享特权' : '基础体验 · 正常'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-ink">
                        {isPaid ? (subscription?.plan_id?.includes('year') ? '按年结算 (优惠41折)' : subscription?.plan_id?.includes('quarter') ? '按季结算 (优惠42折)' : '按月结算') : '永久基础'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-ink">
                        {periodEnd}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-ink">
                          {isPaid ? '3~5 路极速专属渲染通道' : '1 路标准排队通道'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Link href="/pricing#plans" className="inline-flex items-center gap-1 text-xs font-semibold text-warning hover:underline">
                          <span>{isPaid ? '变更方案' : '立即升级'}</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. 表格二：订阅套餐使用量与额度监控表 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink tracking-tight flex items-center gap-2">
                <Zap className="size-4 text-warning" />
                <span>套餐额度使用量监控</span>
              </h2>
              <span className="text-xs text-ink-subtle font-mono">当前总可用算力: {totalCredits}</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-base/90 shadow-elevation-1 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-ink">
                  <thead className="bg-wash text-ink-muted border-b border-line-subtle font-medium uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">配额项目</th>
                      <th className="py-3 px-4">周期预估总量</th>
                      <th className="py-3 px-4">当前已消耗</th>
                      <th className="py-3 px-4">剩余可用额度</th>
                      <th className="py-3 px-4 min-w-[140px]">使用量占比</th>
                      <th className="py-3 px-4">重置/生效规则</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    <tr className="hover:bg-wash transition-colors">
                      <td className="py-3.5 px-4 font-medium text-ink flex items-center gap-2">
                        <Sparkles className="size-3.5 text-success" />
                        <span>{isPaid ? '会员周期赠送算力' : '基础体验赠送算力'}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-ink">
                        {estimatedQuota}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-warning">
                        {displayConsumed}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-success">
                        {totalCredits}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 w-24 bg-wash-press rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-success to-warning rounded-full transition-all duration-page"
                              style={{ width: `${usedPercent}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-ink-muted">{usedPercent}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-ink-muted">
                        {isPaid ? '账期到期自动发放重置' : '永久有效 · 支持签到加赠'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 4. 表格三：订阅与充值历史记录表 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink tracking-tight flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" />
                <span>订阅与充值历史记录</span>
              </h2>
              <span className="text-xs text-ink-subtle">共 {orders.length} 笔历史流水</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-base/90 shadow-elevation-1 backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-ink">
                  <thead className="bg-wash text-ink-muted border-b border-line-subtle font-medium uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">订单号</th>
                      <th className="py-3 px-4">订阅方案 / 充值内容</th>
                      <th className="py-3 px-4">支付金额</th>
                      <th className="py-3 px-4">支付渠道</th>
                      <th className="py-3 px-4">下单时间</th>
                      <th className="py-3 px-4">交易状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-ink-subtle">
                          <p className="text-xs">暂无订阅或充值历史记录</p>
                          <p className="mt-1 text-[11px] text-ink-subtle">完成订阅或加购算力后，所有交易发票与对账单将在此列出。</p>
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id} className="hover:bg-wash transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-ink-muted">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[120px]">{o.id}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(o.id)}
                                className="text-ink-subtle hover:text-ink transition-colors cursor-pointer"
                                title="复制订单号"
                              >
                                {copiedId === o.id ? (
                                  <CheckCircle2 className="size-3 text-success" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-medium text-ink">
                            {o.plan || '会员订阅'}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-ink">
                            {o.amount}
                          </td>
                          <td className="py-3 px-4 text-ink-muted">
                            微信支付 / 支付宝
                          </td>
                          <td className="py-3 px-4 font-mono text-ink-muted">
                            {o.date}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-micro font-bold ${
                              o.color === 'emerald'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : o.color === 'amber'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-zinc-800 text-ink-muted border border-white/10'
                            }`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
