'use client';

// Adapted from Nano Banana Generator's pricing-card anatomy. Checkout and
// entitlement decisions remain in KoyoSIM's billing routes.
export default function PlanCard({ plan, current = false, providers = {}, busy = false, onCheckout }) {
  const isFree = plan.id === 'free';
  return (
    <article className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-transform duration-base hover:-translate-y-0.5 ${current ? 'border-brand-ring bg-cyan-300/[0.06]' : 'border-line bg-wash'}`}>
      {current && <span className="absolute right-4 top-4 text-micro font-semibold text-brand-hover">当前方案</span>}
      <div>
        <h2 className="font-semibold text-ink">{plan.name}</h2>
        <p className="mt-4 text-2xl font-bold text-ink">{plan.monthlyCny ? `¥${plan.monthlyCny}` : '免费'}<span className="ml-1 text-xs font-normal text-ink-subtle">/月</span></p>
        <ul className="mt-4 space-y-2 text-xs leading-5 text-ink-muted">{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul>
      </div>
      {!isFree && (
        <div className="mt-5 space-y-2">
          <button type="button" disabled={busy || !providers.stripe?.enabled} onClick={() => onCheckout(plan.id, 'stripe')} className="w-full rounded-lg border border-line-strong px-3 py-2 text-xs transition-colors hover:bg-wash-press disabled:cursor-not-allowed disabled:opacity-40">{providers.stripe?.enabled ? `海外：Stripe ${providers.stripe.mode === 'test' ? '测试订阅' : '订阅'}` : 'Stripe 待配置'}</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !providers.wechat?.enabled} onClick={() => onCheckout(plan.id, 'wechat')} className="rounded-lg border border-line-strong px-2 py-2 text-xs transition-colors hover:bg-wash-press disabled:cursor-not-allowed disabled:opacity-40">{providers.wechat?.enabled ? '微信支付' : '微信待配置'}</button>
            <button type="button" disabled={busy || !providers.alipay?.enabled} onClick={() => onCheckout(plan.id, 'alipay')} className="rounded-lg border border-line-strong px-2 py-2 text-xs transition-colors hover:bg-wash-press disabled:cursor-not-allowed disabled:opacity-40">{providers.alipay?.enabled ? '支付宝' : '支付宝待配置'}</button>
          </div>
        </div>
      )}
    </article>
  );
}
