'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, Crown, Loader2, ShieldCheck, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QRCodeSvg from '@/components/ui/QRCodeSvg';

function WeChatPayIcon({ className = 'size-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 4C4.8 4 1 7.4 1 11.5c0 2.4 1.3 4.5 3.3 5.8-.2.8-.7 2.4-.8 2.7 0 0-.1.2.1.3.2.1.4 0 .4 0 .6-.4 2.3-1.6 3.1-2.2.8.3 1.6.4 2.4.4.3 0 .7 0 1-.1-.3-.7-.4-1.5-.4-2.4 0-4.4 4-8 9-8 .5 0 1 .1 1.5.2C19.4 6.3 14.8 4 9.5 4z" fill="#07C160" />
      <path d="M17.5 9c-4.1 0-7.5 3-7.5 6.8 0 2.1 1.1 4 2.9 5.2-.2.7-.6 2.1-.7 2.4 0 0-.1.2.1.2.2.1.3 0 .3 0 .5-.3 2-1.4 2.7-1.9.7.2 1.4.3 2.2.3 4.1 0 7.5-3 7.5-6.8S21.6 9 17.5 9z" fill="#07C160" />
      <circle cx="6.5" cy="8.5" r="1" fill="#fff" /><circle cx="12.5" cy="8.5" r="1" fill="#fff" />
      <circle cx="15" cy="13.5" r="1" fill="#fff" /><circle cx="20" cy="13.5" r="1" fill="#fff" />
    </svg>
  );
}

function AlipayIcon({ className = 'size-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#1677FF" />
      <path d="M18.8 15.6c-1.3-.6-3.2-1.4-5.2-2.1 1.1-1.7 1.8-3.7 2-5.7H19V6.6h-4.3V5h-1.8v1.6H8.5v1.2H13c-.3 1.6-.9 3.2-1.7 4.5-1.5-.6-3.1-1.2-4.1-1.2-2.2 0-3.6 1.4-3.6 3.2 0 1.9 1.6 3.3 3.8 3.3 2.3 0 4.6-1.5 6.2-3.8 2.2.8 4.7 1.9 6.2 2.6.5.2 1 .3 1.4.3 1.2 0 2.2-.9 2.2-2.1 0-.6-.3-1.1-.9-1.4l-1.8-.9zM7.2 16.2c-1.3 0-2.1-.8-2.1-1.9 0-1.1.9-1.9 2.1-1.9.9 0 2.1.4 3.4.9-1 1.9-2.2 2.9-3.4 2.9z" fill="#fff" />
    </svg>
  );
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function fetchPayload(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '商品目录暂不可用');
  return payload;
}

export default function RechargeModal({
  isOpen,
  onClose,
  initialTab = 'sub',
  initialPlanId = null,
  initialCreditPackId = null,
  initialBillingCycle = 'monthly',
  onPaySuccess,
}) {
  const isCreditPack = ['points', 'credits', 'credit_pack'].includes(initialTab);
  const [product, setProduct] = useState(null);
  const [providers, setProviders] = useState({});
  const [payMethod, setPayMethod] = useState(isCreditPack ? 'alipay' : 'wechat');
  const [billingCycle, setBillingCycle] = useState(initialBillingCycle || 'monthly');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkoutData, setCheckoutData] = useState(null);
  const [pollStatus, setPollStatus] = useState('waiting');
  const [countdown, setCountdown] = useState(900);
  const pollTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const paidCallbackRef = useRef(false);

  useEffect(() => {
    if (initialBillingCycle) {
      setBillingCycle(initialBillingCycle);
    }
  }, [initialBillingCycle]);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    pollTimerRef.current = null;
    countdownTimerRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    clearTimers();
    setCheckoutData(null);
    setPollStatus('waiting');
    setError('');
    onClose?.();
  }, [clearTimers, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setCatalogLoading(true);
    setProduct(null);
    setProviders({});
    setError('');
    setCheckoutData(null);
    setPollStatus('waiting');
    paidCallbackRef.current = false;

    const catalogUrl = isCreditPack ? '/api/billing/credit-packs' : '/api/billing/plans';
    fetchPayload(catalogUrl)
      .then((payload) => {
        if (cancelled) return;
        const entries = isCreditPack
          ? (Array.isArray(payload.packs) ? payload.packs : [])
          : (Array.isArray(payload.plans) ? payload.plans : []);
        const selectedId = isCreditPack ? initialCreditPackId : initialPlanId;
        const selectedProduct = entries.find((entry) => entry.id === selectedId);
        setProviders(payload.providers || {});
        setProduct(selectedProduct || null);
        const usableMethods = isCreditPack
          ? ['alipay', 'wechat']
          : ['wechat', 'alipay', 'stripe'];
        const firstAvailable = usableMethods.find((method) => payload.providers?.[method]?.enabled);
        setPayMethod((current) => payload.providers?.[current]?.enabled ? current : (firstAvailable || usableMethods[0]));
        if (!selectedProduct) setError('所选商品当前不可购买，请返回方案页重新选择。');
        else if (!firstAvailable) setError('当前没有已开通的支付方式，不会创建未支付订单。');
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || '商品目录暂不可用');
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => { cancelled = true; };
  }, [initialCreditPackId, initialPlanId, isCreditPack, isOpen]);

  useEffect(() => {
    if (!checkoutData?.orderId || pollStatus === 'paid' || pollStatus === 'expired') return undefined;
    setCountdown(900);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((remaining) => {
        if (remaining <= 1) {
          clearTimers();
          setPollStatus('expired');
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    pollTimerRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/billing/orders/${checkoutData.orderId}/status`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.status === 'paid' && !paidCallbackRef.current) {
          paidCallbackRef.current = true;
          clearTimers();
          setPollStatus('paid');
          onPaySuccess?.({
            creditAmount: checkoutData.creditAmount,
            pointsAdded: isCreditPack ? checkoutData.creditAmount : 0,
            coinsAdded: isCreditPack ? checkoutData.creditAmount : 0,
            orderId: checkoutData.orderId,
          });
          window.dispatchEvent(new CustomEvent('koyosim:credits-updated', { detail: { orderId: checkoutData.orderId } }));
        }
      } catch {
        // 状态查询失败时保留二维码，并在下一轮继续查。
      }
    }, 2000);
    return clearTimers;
  }, [checkoutData, clearTimers, isCreditPack, onPaySuccess, pollStatus]);

  if (!isOpen) return null;

  const getPlanCyclePrice = (prod, cycle) => {
    if (!prod) return 0;
    if (cycle === 'yearly') {
      return Number(prod.yearlyCny || prod.meta?.yearlyCny || (prod.monthlyCny ? Math.round(prod.monthlyCny * 12 * 0.7) : 0));
    }
    if (cycle === 'quarterly') {
      return Number(prod.quarterlyCny || prod.meta?.quarterlyCny || (prod.monthlyCny ? Math.round(prod.monthlyCny * 3 * 0.85) : 0));
    }
    return Number(prod.monthlyCny || 0);
  };

  const amountYuan = isCreditPack ? Number(product?.priceCny || 0) : getPlanCyclePrice(product, billingCycle);
  const creditAmount = isCreditPack
    ? Number(product?.credits || 0)
    : Number(product?.quotaBase || 0) + Number(product?.quotaBonus || 0);
  const availableMethods = (isCreditPack ? ['alipay', 'wechat'] : ['wechat', 'alipay', 'stripe'])
    .filter((method) => providers[method]?.enabled);

  const handleCreateOrder = async () => {
    if (!product?.id || !providers[payMethod]?.enabled || loading) return;
    setLoading(true);
    setError('');
    try {
      const idempotencyKey = `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(isCreditPack
          ? { productType: 'credit_pack', productId: product.id, provider: payMethod }
          : { productType: 'subscription', planId: product.id, billingCycle, provider: payMethod }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '创建支付订单失败，请稍后重试');
      if (payMethod === 'stripe' && payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }
      if (!payload.qrCodeUrl) throw new Error(payload.error || '支付平台没有返回有效二维码，请勿继续支付');
      const confirmedAmount = Number(payload.creditAmount);
      if (!Number.isSafeInteger(confirmedAmount) || confirmedAmount !== creditAmount || confirmedAmount <= 0) {
        throw new Error('订单返回的算力与商品目录不一致，请勿继续支付。');
      }
      setCheckoutData({
        orderId: payload.orderId,
        qrUrl: payload.qrCodeUrl,
        amountYuan: payload.amountYuan || amountYuan.toFixed(2),
        provider: payMethod,
        planName: product.name,
        creditAmount: confirmedAmount,
      });
      paidCallbackRef.current = false;
      setPollStatus('waiting');
    } catch (checkoutError) {
      setError(checkoutError.message || '支付平台暂不可用，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-scrim/90 p-3 backdrop-blur-md sm:p-6" role="presentation">
      <div className="pricing-frame-bg relative my-auto w-full max-w-xl rounded-2xl border border-line p-5 shadow-elevation-4 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button type="button" onClick={handleClose} className="pricing-raised-bg absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-muted transition-colors duration-fast hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring" aria-label="关闭结账窗口">
          <X className="size-4" />
        </button>

        {checkoutData ? (
          <>
            <div className="pr-10">
              <h2 id="checkout-title" className="text-xl font-extrabold text-ink">{pollStatus === 'paid' ? '支付成功' : '扫码完成支付'}</h2>
              <p className="mt-1 text-xs text-ink-muted">{pollStatus === 'paid' ? '服务端已核验支付并确认订单。' : '请使用对应手机 App 扫码；只有收到并核验支付回调后才会入账。'}</p>
            </div>
            {pollStatus === 'paid' ? (
              <div className="pricing-paid-bg mt-6 flex flex-col items-center rounded-2xl border border-line px-5 py-8 text-center animate-in zoom-in duration-base">
                <CheckCircle2 className="size-14 text-success" />
                <p className="mt-3 text-lg font-bold text-ink">已到账 {checkoutData.creditAmount.toLocaleString()} 算力</p>
                <p className="mt-1 text-xs text-ink-muted">订单 {checkoutData.orderId}</p>
                <Button type="button" variant="primary" className="mt-5" onClick={handleClose}>完成并返回</Button>
              </div>
            ) : pollStatus === 'expired' ? (
              <div className="mt-6 rounded-2xl border border-warning-line bg-warning-soft p-6 text-center">
                <p className="text-sm font-semibold text-warning">二维码已过期，本订单不会自动重试。</p>
                <Button type="button" variant="secondary" className="mt-4" onClick={() => { setCheckoutData(null); setPollStatus('waiting'); }}>返回重新发起</Button>
              </div>
            ) : (
              <div className="pricing-paid-bg mt-6 flex flex-col items-center rounded-2xl border border-line p-5 text-center">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {checkoutData.provider === 'wechat' ? <><WeChatPayIcon />微信支付扫码</> : <><AlipayIcon />支付宝扫码</>}
                </div>
                <p className="mt-2 text-xs text-ink-muted">实付 <strong className="text-lg text-ink">¥{checkoutData.amountYuan}</strong></p>
                <div className="mt-4 rounded-xl bg-white p-2 shadow-elevation-4"><QRCodeSvg value={checkoutData.qrUrl} size={216} /></div>
                <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted"><Loader2 className="size-3.5 animate-spin" />等待支付确认 · 有效时间 <span className="font-mono font-bold text-ink">{formatCountdown(countdown)}</span></p>
                <p className="mt-2 text-micro text-ink-subtle">订单号：{checkoutData.orderId}</p>
                <button type="button" onClick={() => { clearTimers(); setCheckoutData(null); setPollStatus('waiting'); }} className="mt-5 inline-flex items-center gap-1 text-xs text-ink-muted transition hover:text-ink"><ArrowLeft className="size-3.5" />返回商品确认</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="pr-10">
              <span className="pricing-raised-bg inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-micro font-bold text-ink-muted">
                {isCreditPack ? <Zap className="size-3 text-warning" /> : <Crown className="size-3 text-warning" />}
                {isCreditPack
                  ? '一次性算力包'
                  : billingCycle === 'yearly'
                    ? '年度会员方案 · 限时特惠'
                    : billingCycle === 'quarterly'
                      ? '季度会员方案 · 季付特惠'
                      : '月度会员方案'}
              </span>
              <h2 id="checkout-title" className="mt-3 text-xl font-extrabold tracking-tight text-ink">确认购买</h2>
              <p className="mt-1 text-xs text-ink-muted">商品和价格由服务端目录核验；此处只确认支付方式，不会更换套餐。</p>
            </div>

            <div className="pricing-raised-bg mt-5 rounded-2xl border border-line p-4">
              {catalogLoading ? (
                <div className="flex min-h-16 items-center justify-center gap-2 text-xs text-ink-muted"><Loader2 className="size-4 animate-spin" />正在校验商品…</div>
              ) : product ? (
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{product.name}</p>
                      <p className="mt-1 text-caption text-ink-muted">
                        {isCreditPack
                          ? '永久通用算力'
                          : billingCycle === 'yearly'
                            ? '年度会员权益（每月自动发放）'
                            : billingCycle === 'quarterly'
                              ? '季度会员权益（每月自动发放）'
                              : '月度会员权益'} · {creditAmount.toLocaleString()} 算力
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-black text-ink">¥{amountYuan.toLocaleString('en-US')}</p>
                  </div>

                  {!isCreditPack && (
                    <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2.5">
                      <span className="text-caption text-ink-muted">订阅周期</span>
                      <div className="inline-flex rounded-lg border border-line bg-base p-0.5">
                        {[
                          { id: 'yearly', label: '年付' },
                          { id: 'quarterly', label: '季付' },
                          { id: 'monthly', label: '月付' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setBillingCycle(tab.id)}
                            className={`rounded-md px-2.5 py-1 text-caption font-bold transition ${billingCycle === tab.id ? 'bg-ink text-ink-inverse' : 'text-ink-muted hover:text-ink'}`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-warning">无法校验所选商品。</p>
              )}
            </div>

            <section className="mt-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">选择付款方式</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {availableMethods.map((method) => (
                  <button key={method} type="button" onClick={() => setPayMethod(method)} aria-pressed={payMethod === method}
                    className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${payMethod === method ? 'border-brand bg-brand-soft text-ink ring-2 ring-brand-line shadow-elevation-2' : 'pricing-raised-bg border-line text-ink-muted hover:border-line-strong hover:text-ink'}`}>
                    {method === 'wechat' ? <><WeChatPayIcon className="size-4" />微信支付</> : method === 'alipay' ? <><AlipayIcon className="size-4" />支付宝</> : <><CreditCard className="size-4" />国际信用卡</>}
                  </button>
                ))}
              </div>
              {!catalogLoading && availableMethods.length === 0 && (
                <p className="mt-3 rounded-xl border border-warning-line bg-warning-soft p-3 text-center text-xs text-warning" role="status">当前没有可用的支付通道，不会创建订单。</p>
              )}
            </section>

            <div className="mt-6 flex flex-col gap-4 border-t border-line-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-micro text-ink-subtle">应付金额</p>
                <p className="mt-0.5 text-2xl font-black text-ink">¥{amountYuan.toLocaleString('en-US')}</p>
              </div>
              <Button type="button" variant="primary" size="lg" onClick={handleCreateOrder}
                disabled={catalogLoading || loading || !product || !providers[payMethod]?.enabled}
                className="pricing-pink-bg h-12 min-w-48 gap-2 rounded-full px-7 font-extrabold text-white shadow-elevation-3 hover:brightness-110">
                {loading ? <><Loader2 className="size-4 animate-spin" />正在创建订单…</> : payMethod === 'stripe' ? '前往 Stripe 收银台' : '立即确认并支付'}
              </Button>
            </div>

            <p className="mt-4 flex items-start gap-2 text-micro leading-5 text-ink-subtle"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-info" />余额仅在支付平台回调核验通过后入账；订单金额和商品额度以服务端记录为准。</p>
          </>
        )}

        {error && <p className="mt-4 rounded-xl border border-warning-line bg-warning-soft px-3 py-2.5 text-xs text-warning" role="alert">{error}</p>}
      </div>
    </div>
  );
}
