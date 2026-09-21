'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Briefcase, Check, ChevronDown, CircleUserRound, Crown, CreditCard, Gift, HelpCircle, Loader2, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import RechargeModal from '@/components/account/RechargeModal';

const PLAN_CODE_NAMES = {
  starter: 'BASE',
  basic: 'STAR',
  plus: 'PRO',
  pro: 'APEX',
};

const FAQ_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'quota', label: '算力与额度' },
  { id: 'subscription', label: '订阅与续费' },
  { id: 'payment', label: '支付与发票' },
  { id: 'refund_copyright', label: '退款与版权' },
];

const DEFAULT_FAQS = [
  {
    id: 'faq-1',
    category: 'quota',
    question: '什么是订阅制专属额度？与通用算力有何区别？',
    answer: '订阅额度是每月随会员周期发放的核心资产，享有最高抵扣优先级，当月有效；通用算力永久有效，在月度额度用尽后自动作为备用池抵扣，两者协同保障您的创作不间断。',
  },
  {
    id: 'faq-2',
    category: 'quota',
    question: '生成失败会扣除我的额度吗？',
    answer: '绝对不会。系统采用两阶段安全预扣机制，因合规拦截或模型超时等非用户原因未完成时，冻结额度将在 1 秒内 100% 自动解冻返还至您的账户。',
  },
  {
    id: 'faq-3',
    category: 'payment',
    question: '支持哪些支付方式与开票？',
    answer: '全面支持支付宝扫码、微信支付直付及国际信用卡（Visa / MasterCard）。创作者与企业用户可在个人中心“订单发票”页面随时申请增值税电子发票。',
  },
  {
    id: 'faq-4',
    category: 'subscription',
    question: '支持随时变更或取消订阅吗？',
    answer: '由您完全自主控制。您可以随时在个人中心“会员订阅”中查看当前方案、升级档位或管理续费。取消后，已生效周期的全部权益与算力仍可正常使用直至周期届满。',
  },
  {
    id: 'faq-5',
    category: 'subscription',
    question: '订阅后切换套餐，算力及权益会怎么变化？',
    answer: `KoyoSIM 提供灵活的月度、季度与年度订阅方案，每个方案都包含一定数量的算力，可用于图像生成、视频生成、音乐生成与编辑等功能。注：进行档位升级或延长时，暂不支持补差价升级方式，升级支付档位正常价格。具体分为以下六种情况：

(1) 月付套餐：从低档位升级到高档位
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的订阅套餐，将从升级付款成功之日起，重新按 31 天计算，算力即刻到账

(2) 季付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(3) 年付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(4) 同档位套餐：从月付升级为季付
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，算力即刻到账

(5) 同档位套餐：从月付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(6) 同档位套餐：从季付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

温馨提示：如有疑问可随时通过客服渠道或发送邮件至 support@koyosim.com 联系我们。`,
  },
  {
    id: 'faq-6',
    category: 'subscription',
    question: '关于自动续费与取消自动续费？',
    answer: '如果您开通了周期连续订阅，系统将在每个账期届满前 24 小时向您发送通知或发起续期。您可随时在个人中心“会员订阅”中点击关闭自动续费，关闭后不会影响当前周期的任何特权与可用算力，次期将不再进行任何扣款。',
  },
  {
    id: 'faq-7',
    category: 'refund_copyright',
    question: '如何申请退款？',
    answer: '如果您在最近一次付款后未有任何生成行为、权益使用和算力消耗，可在购买后 7 天内申请全额退款。若因系统故障导致生成失败，系统将自动返还相应算力。如需申请退款，请前往个人中心提交工单或发送邮件（附带您的账号与退款原因）至客服邮箱，审核通过后将在 5-10 个工作日内退回原支付账户。',
  },
  {
    id: 'faq-8',
    category: 'payment',
    question: '我们支持下载账单凭证，以及企业用户的开发票服务。',
    answer: '支持。您可以在个人中心的“订单与发票”板块一键下载所有充值与订阅的电子对账凭据。针对企业团队用户，我们支持开具增值税普通发票及增值税专用发票，后台直接录入开票抬头和企业统一社会信用代码即可申请。',
  },
  {
    id: 'faq-9',
    category: 'refund_copyright',
    question: '我在 KoyoSIM 生成的内容归谁所有？',
    answer: '在法律允许的最大范围内，您拥有在 KoyoSIM 上生成的所有内容的所有权。平台不会对用户创作的作品主张任何版权。这意味着您可以自由地发布、下载、分发和将这些视频及图像用于商业盈利场景。',
  },
  {
    id: 'faq-10',
    category: 'refund_copyright',
    question: '免责声明与服务支持',
    answer: '上述内容仅供参考。KoyoSIM 会根据产品功能迭代与用户体验需要，适时优化功能、价格、订阅方案及算力规则。如出现争议或不一致情况，将以后台系统实际记录与财务账单数据为准，最终解释权归 KoyoSIM 所有。其他相关细则详见《用户协议》与《隐私政策》。',
  },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function getPlanFeatureGroups(plan) {
  const features = (Array.isArray(plan.features) ? plan.features : []).filter((feature) => !/^每月\s/.test(String(feature || '').trim()));
  const configured = plan.featureGroups;
  if (configured && typeof configured === 'object') {
    const sourceGroups = [
      { label: '视频模型专享', items: configured.video },
      { label: '图像模型特惠', items: configured.image },
      { label: '更多权益', items: configured.more },
    ];
    const normalized = sourceGroups.map((group) => ({
      label: group.label,
      items: Array.isArray(group.items) ? group.items.map((item) => String(item || '').trim()).filter(Boolean) : [],
    })).filter((group) => group.items.length > 0);
    if (normalized.length) return normalized;
  }

  const groups = [
    { label: '视频模型专享', items: [] },
    { label: '图像模型特惠', items: [] },
    { label: '更多权益', items: [] },
  ];

  for (const feature of features) {
    const value = String(feature || '').trim();
    if (!value) continue;
    if (/seedance|wan\b|视频|video/i.test(value)) groups[0].items.push(value);
    else if (/flova|图片|图像|image/i.test(value)) groups[1].items.push(value);
    else groups[2].items.push(value);
  }
  return groups.filter((group) => group.items.length > 0);
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败 (${response.status})`);
  return payload;
}

function PlanCard({ plan, billingCycle = 'monthly', onBuy, disabled }) {
  const base = Number(plan.quotaBase || 0);
  const bonus = Number(plan.quotaBonus || 0);
  const total = base + bonus;
  const groups = getPlanFeatureGroups(plan);
  const isPopular = plan.id === 'basic';
  const isFlagship = plan.id === 'pro';

  // 周期价格与副标计算
  let price = Number(plan.monthlyCny || 0);
  let originalPrice = null;
  let cycleLabel = '/ 月';
  let subText = '按月结算 · 随时取消';

  if (billingCycle === 'yearly') {
    price = Number(plan.yearlyCny || plan.meta?.yearlyCny || (plan.monthlyCny ? Math.round(plan.monthlyCny * 12 * 0.7) : 0));
    originalPrice = Number(plan.monthlyCny ? plan.monthlyCny * 12 : 0);
    cycleLabel = '/ 年';
    const monthlyAvg = (price / 12).toFixed(1).replace(/\.0$/, '');
    subText = `折合 ¥${monthlyAvg}/月 · 每年结算`;
  } else if (billingCycle === 'quarterly') {
    price = Number(plan.quarterlyCny || plan.meta?.quarterlyCny || (plan.monthlyCny ? Math.round(plan.monthlyCny * 3 * 0.85) : 0));
    originalPrice = Number(plan.monthlyCny ? plan.monthlyCny * 3 : 0);
    cycleLabel = '/ 季';
    const monthlyAvg = (price / 3).toFixed(1).replace(/\.0$/, '');
    subText = `折合 ¥${monthlyAvg}/月 · 每季结算`;
  }

  return (
    <article
      className={`pricing-plan-card relative flex min-w-0 flex-col rounded-2xl border p-5 transition-[background-color,border-color,color,transform] duration-page hover:-translate-y-0.5 hover:shadow-elevation-3 sm:p-6 xl:min-h-[802px] ${
        isPopular
          ? 'pricing-lime-border pricing-card-bg pricing-lime-glow shadow-elevation-2'
          : isFlagship
            ? 'pricing-pink-border pricing-card-bg pricing-pink-glow shadow-elevation-2'
            : 'border-line pricing-card-bg hover:border-line-strong'
      }`}
    >
      {isPopular && (
        <span className="pricing-lime-bg absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-micro font-extrabold uppercase tracking-wider text-ink-inverse shadow-elevation-2">
          最受欢迎
        </span>
      )}
      {isFlagship && (
        <span className="pricing-lime-bg absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-micro font-extrabold uppercase tracking-wider text-ink-inverse shadow-elevation-2">
          旗舰尊享
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-black tracking-wider text-ink">{PLAN_CODE_NAMES[plan.id] || plan.id.toUpperCase()}</span>
          <h2 className="mt-1 truncate text-body-sm text-ink-muted">{plan.name}</h2>
        </div>
        <span className="shrink-0 rounded-md border border-line bg-well px-2 py-1 text-micro font-bold pricing-lime-text">
          {plan.badge || (billingCycle === 'yearly' ? '年度特惠' : billingCycle === 'quarterly' ? '季度会员' : '月度会员')}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-4xl font-extrabold tracking-tight text-ink">¥{formatNumber(price)}</span>
          <span className="text-caption text-ink-subtle">{cycleLabel}</span>
          {originalPrice && originalPrice > price && (
            <span className="text-caption text-ink-subtle line-through ml-1">¥{formatNumber(originalPrice)}</span>
          )}
        </div>
        <p className="mt-1 text-caption text-ink-subtle">{subText}</p>
      </div>

      <div className="mt-4 rounded-xl border border-line-subtle pricing-panel-bg p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold">
          <span className="flex items-center gap-2 text-ink"><Zap className="size-3.5 text-warning" />每月到账</span>
          <span className="pricing-lime-text font-mono text-sm">{formatNumber(total)} 算力</span>
        </div>
        <p className="mt-1.5 text-micro text-ink-subtle">基础 {formatNumber(base)} + 赠送 {formatNumber(bonus)}</p>
      </div>

      <button
        type="button"
        onClick={() => onBuy(plan.id, billingCycle)}
        disabled={disabled}
        className={`mt-4 min-h-11 w-full rounded-xl px-3 text-xs font-extrabold tracking-wide transition-[background-color,border-color,color] duration-base active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
          isPopular
            ? 'pricing-lime-bg pricing-lime-glow text-ink-inverse shadow-elevation-3 hover:brightness-110'
          : isFlagship
              ? 'pricing-pink-bg pricing-pink-glow text-white shadow-elevation-3 hover:brightness-110'
              : 'bg-ink text-ink-inverse hover:brightness-110'
        }`}
      >
        {disabled ? '套餐暂不可用' : '立即订阅'}
      </button>

      <div className="mt-5 flex-1 space-y-4 border-t border-line-subtle pt-4">
        {groups.map((group) => (
          <section key={group.label}>
            <h3 className="text-label font-bold uppercase tracking-widest text-ink-subtle">{group.label}</h3>
            <ul className="mt-2 space-y-2">
              {group.items.map((feature, index) => (
                <li key={`${group.label}-${index}`} className="flex items-start gap-2 text-body-sm leading-5 text-ink-muted">
                  <Check className="mt-0.5 size-3.5 shrink-0 pricing-lime-text" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line-subtle pt-3 text-micro text-ink-subtle">
        <span className="inline-flex items-center gap-1.5"><CreditCard className="size-3.5 text-info" />按可用支付渠道结算</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-info" />订单核验后到账</span>
      </div>
    </article>
  );
}

function CreditPackCard({ pack, selected, onSelect }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(pack.id)}
      className={`group relative flex min-h-24 flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center transition-[background-color,border-color,color,transform] duration-base hover:-translate-y-0.5 hover:shadow-elevation-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring active:scale-95 ${
        selected
          ? 'pricing-pink-border pricing-pink-soft-bg shadow-elevation-2'
          : 'border-line pricing-surface-bg hover:border-line-strong'
      }`}
    >
      <span className={`inline-flex items-center gap-2 text-sm font-extrabold ${selected ? 'pricing-pink-text' : 'text-ink'}`}>
        <Briefcase className="size-4" aria-hidden="true" />
        {formatNumber(pack.credits)}
      </span>
      <span className={`mt-1 text-xs font-bold ${selected ? 'text-ink' : 'text-ink-muted'}`}>¥{formatNumber(pack.priceCny)}</span>
    </button>
  );
}

export default function PricingClient() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [plans, setPlans] = useState([]);
  const [packs, setPacks] = useState([]);
  const [planProviders, setPlanProviders] = useState({});
  const [creditProviders, setCreditProviders] = useState({});
  const [credits, setCredits] = useState(null);
  const [currentPlanName, setCurrentPlanName] = useState('FREE 工作室');
  const [plansLoading, setPlansLoading] = useState(true);
  const [packsLoading, setPacksLoading] = useState(true);
  const [planError, setPlanError] = useState('');
  const [packError, setPackError] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('credit_490');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [faqs, setFaqs] = useState(DEFAULT_FAQS);
  const [faqCategory, setFaqCategory] = useState('all');
  const [openFaq, setOpenFaq] = useState(DEFAULT_FAQS[0]?.id || 'faq-1');
  const pendingCheckoutRef = useRef(null);

  const loadInitialData = useCallback(async () => {
    const [accountResult, planResult, packResult, faqResult] = await Promise.allSettled([
      getJson('/api/auth/me'),
      getJson('/api/billing/plans'),
      getJson('/api/billing/credit-packs'),
      getJson('/api/site/subscription-faq'),
    ]);

    if (accountResult.status === 'fulfilled') {
      const account = accountResult.value;
      setUser(account.user || null);
      setCurrentPlanName(account.entitlements?.planName || (account.user ? '创作者会员' : 'FREE 工作室'));
      const buckets = account.entitlements?.creditBuckets;
      setCredits(Number(buckets?.totalAvailable ?? account.entitlements?.credits ?? 0));
    } else {
      setUser(null);
      setCurrentPlanName('FREE 工作室');
      setCredits(null);
    }

    if (planResult.status === 'fulfilled') {
      const published = Array.isArray(planResult.value.plans) ? planResult.value.plans : [];
      const commercial = published
        .filter((plan) => ['starter', 'basic', 'plus', 'pro'].includes(plan.id) && plan.enabled !== false)
        .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
      setPlans(commercial);
      setPlanProviders(planResult.value.providers || {});
      setPlanError(commercial.length ? '' : '当前没有可用的会员方案。');
    } else {
      setPlans([]);
      setPlanProviders({});
      setPlanError(planResult.reason?.message || '会员方案暂时无法读取，请稍后重试。');
    }
    setPlansLoading(false);

    if (packResult.status === 'fulfilled') {
      const published = Array.isArray(packResult.value.packs) ? packResult.value.packs : [];
      setPacks(published);
      setCreditProviders(packResult.value.providers || {});
      setPackError(published.length ? '' : '通用算力包暂不可用。');
      if (published.length) setSelectedPackId((current) => published.some((pack) => pack.id === current) ? current : published[0].id);
    } else {
      setPacks([]);
      setCreditProviders({});
      setPackError(packResult.reason?.message || '通用算力包暂时无法读取，请稍后重试。');
    }
    setPacksLoading(false);

    if (faqResult.status === 'fulfilled' && Array.isArray(faqResult.value?.items) && faqResult.value.items.length > 0) {
      setFaqs(faqResult.value.items);
    }

    return accountResult.status === 'fulfilled' ? accountResult.value : null;
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const sectionId = window.location.hash.slice(1);
    if (!['plans', 'credit-packs'].includes(sectionId)) return undefined;
    if (sectionId === 'credit-packs' && (plansLoading || packsLoading)) return undefined;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [packsLoading, plansLoading]);

  const selectedPack = useMemo(() => packs.find((pack) => pack.id === selectedPackId) || null, [packs, selectedPackId]);
  const hasSubscriptionProvider = Object.values(planProviders).some((provider) => provider?.enabled);
  const hasCreditProvider = ['alipay', 'wechat'].some((provider) => creditProviders[provider]?.enabled);

  const filteredFaqs = useMemo(() => {
    if (faqCategory === 'all') return faqs;
    if (faqCategory === 'refund_copyright') {
      return faqs.filter((f) => ['refund', 'copyright', 'legal', 'refund_copyright'].includes(f.category));
    }
    return faqs.filter((f) => f.category === faqCategory);
  }, [faqs, faqCategory]);

  const startCheckout = (type, id, cycle = billingCycle) => {
    if (!user) {
      pendingCheckoutRef.current = { type, id, billingCycle: cycle };
      setShowAuthModal(true);
      return;
    }
    setCheckout({ type, id, billingCycle: cycle });
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await loadInitialData();
    if (pendingCheckoutRef.current) {
      setCheckout(pendingCheckoutRef.current);
      pendingCheckoutRef.current = null;
    }
  };

  return (
    <div className="pricing-page pricing-page-bg min-h-screen px-3 py-4 text-ink selection:bg-brand-soft sm:px-6 sm:py-8 lg:px-16">
      <main className="relative mx-auto w-full max-w-screen-2xl rounded-2xl border border-line bg-base px-4 pb-12 pt-12 shadow-elevation-3 sm:px-8 sm:pt-12 sm:pb-64 lg:px-10">
        <button type="button" onClick={() => router.back()} aria-label="关闭会员方案" className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full border border-line bg-raised text-ink-muted transition-colors duration-fast hover:bg-wash hover:text-ink">
          <X className="size-4" />
        </button>
        <section className="mx-auto max-w-6xl text-center">
          <span className="pricing-lime-soft-bg inline-flex items-center gap-2 rounded-full border pricing-lime-border px-4 py-1.5 text-caption font-bold tracking-wide pricing-lime-text">
            <Crown className="size-3.5" /> KoyoSIM 会员订阅服务
          </span>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-ink sm:text-5xl lg:text-6xl">订阅会员，升级你的创作权益</h1>
          <p className="mx-auto mt-3 max-w-3xl text-xs leading-6 text-ink-muted sm:text-sm">
            专享高并发 GPU 算力通道 · 200+ 顶级 AI 模型全开 · 支持微信支付与支付宝
          </p>

          <div className="mt-7 grid w-full grid-cols-1 justify-items-center gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-0 sm:justify-items-stretch">
            <div className="inline-flex items-center justify-center rounded-full border border-line pricing-card-bg p-1 shadow-elevation-2 sm:col-start-2 sm:min-w-max" aria-label="订阅周期">
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-bold transition-[background-color,color] duration-base ${
                  billingCycle === 'yearly'
                    ? 'bg-ink text-ink-inverse shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>年付</span>
                <span className="rounded-full bg-warning px-1.5 py-0.5 text-micro font-extrabold text-ink-inverse">最低41折</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('quarterly')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-bold transition-[background-color,color] duration-base ${
                  billingCycle === 'quarterly'
                    ? 'bg-ink text-ink-inverse shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>季付</span>
                <span className="rounded-full bg-well border border-line px-1.5 py-0.5 text-micro font-extrabold pricing-lime-text">最低42折</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-full px-4 py-2 text-caption font-bold transition-[background-color,color] duration-base ${
                  billingCycle === 'monthly'
                    ? 'bg-ink text-ink-inverse shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                月付
              </button>
            </div>
            <Link href="#credit-packs" className="pricing-pink-outline pricing-pink-wash-bg pricing-pink-hover-border inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold text-ink transition-[background-color,border-color,color,transform] duration-base hover:-translate-y-0.5 hover:shadow-elevation-3 sm:col-start-3 sm:min-w-menu sm:justify-self-end">
              <Gift className="size-3.5 pricing-pink-text" /> 购买通用算力包 <span className="pricing-pink-bg rounded-full px-2 py-0.5 text-micro font-extrabold text-white">充值特惠</span> <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <p className="mt-2 text-micro text-ink-subtle">年付/季付享超值阶梯优惠 · 随时可升级或调整</p>
        </section>

        <section id="plans" aria-label="会员订阅方案" className="scroll-mt-0 mt-8">
          {plansLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border border-line pricing-card-bg text-xs text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> 正在读取会员方案…
            </div>
          ) : planError ? (
            <div className="rounded-2xl border border-warning-line bg-warning-soft p-5 text-sm text-warning" role="alert">{planError}</div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  billingCycle={billingCycle}
                  disabled={!hasSubscriptionProvider}
                  onBuy={(id, cycle) => startCheckout('subscription', id, cycle)}
                />
              ))}
            </div>
          )}
          {!plansLoading && plans.length > 0 && !hasSubscriptionProvider && (
            <p className="mt-3 text-center text-xs text-warning" role="status">支付渠道暂不可用；不会创建不可支付的订单。</p>
          )}
        </section>

        <section id="credit-packs" className="scroll-mt-0 mt-16">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line-subtle pb-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-ink">补充通用算力</h2>
              <p className="mt-1 text-xs text-ink-muted">一次性购买、到账后永久有效；与会员月度额度分开显示。</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-micro text-ink-subtle"><ShieldCheck className="size-3.5 text-info" />仅展示人民币可用支付方式</span>
          </div>

          <div className="pricing-frame-bg rounded-2xl border border-line p-4 shadow-elevation-4 sm:p-6 lg:p-7">
            <div className="pricing-raised-bg flex flex-col gap-4 rounded-2xl border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="pricing-avatar-bg flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-elevation-2"><CircleUserRound className="size-5" /></span>
                <div className="min-w-0 text-left">
                  <p className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                    <span>目前是</span><span className="rounded border border-line px-1.5 py-0.5 font-bold text-ink">{user ? currentPlanName : 'FREE 工作室'}</span>
                    <Link href="#plans" className="font-semibold pricing-pink-text hover:underline">升级会员 →</Link>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <span className="text-caption font-semibold text-ink-muted">通用盒</span>
              <span className="inline-flex items-center gap-1.5 text-lg font-black text-ink"><Zap className="size-4" />{credits === null ? '登录后同步' : formatNumber(credits)}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-ink">通用算力包</h3>
              <span className="text-micro text-ink-subtle">选择一档继续安全结账</span>
            </div>

            {packsLoading ? (
              <div className="flex min-h-36 items-center justify-center gap-2 text-xs text-ink-muted"><Loader2 className="size-4 animate-spin" />正在读取算力包…</div>
            ) : packError ? (
              <div className="mt-4 rounded-xl border border-warning-line bg-warning-soft p-4 text-xs text-warning" role="alert">{packError}</div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {packs.map((pack) => (
                    <CreditPackCard key={pack.id} pack={pack} selected={selectedPackId === pack.id} onSelect={setSelectedPackId} />
                  ))}
                </div>
                <p className="mt-4 flex items-start gap-2 text-micro leading-5 text-ink-subtle">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 pricing-lime-text" />
                  通用算力包为一次性购买。服务端按所选商品 ID 锁定价格和额度，支付成功回调通过幂等流水写入永久算力余额。
                </p>
                <button
                  type="button"
                  onClick={() => selectedPack && startCheckout('credit_pack', selectedPack.id)}
                  disabled={!selectedPack || !hasCreditProvider}
                  className="pricing-pink-bg pricing-pink-glow mx-auto mt-5 flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-full px-6 text-sm font-extrabold text-white shadow-elevation-3 transition-transform duration-base hover:-translate-y-0.5 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Zap className="size-4" />
                  {selectedPack ? `购买 ${formatNumber(selectedPack.credits)} 算力包 · ¥${formatNumber(selectedPack.priceCny)}` : '选择算力包'}
                </button>
                {!hasCreditProvider && <p className="mt-3 text-center text-xs text-warning" role="status">目前没有可用的支付宝或微信支付通道。</p>}
                {selectedPack && <p className="mt-2 text-center text-micro text-ink-subtle">选择后进入支付确认；此处不会直接扣款或写入余额。</p>}
              </>
            )}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-4xl">
          <div className="text-center">
            <span className="pricing-lime-soft-bg inline-flex items-center gap-1.5 rounded-full border pricing-lime-border px-3.5 py-1 text-micro font-bold pricing-lime-text">
              <HelpCircle className="size-3.5" /> 常见问题
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">订阅与权益常见问题</h2>
            <p className="mt-2 text-xs text-ink-muted">了解更多关于套餐、计费、算力机制及退款政策的详细解答</p>
          </div>

          {/* 分类 Tabs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {FAQ_CATEGORIES.map((cat) => {
              const active = faqCategory === cat.id;
              const count = cat.id === 'all'
                ? faqs.length
                : faqs.filter((f) => f.category === cat.id || (cat.id === 'refund_copyright' && ['refund', 'copyright', 'legal', 'refund_copyright'].includes(f.category))).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFaqCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-caption font-bold transition-[background-color,border-color,color] duration-base ${
                    active
                      ? 'bg-ink text-ink-inverse shadow-elevation-2'
                      : 'border border-line pricing-card-bg text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className={`text-micro rounded-full px-1.5 py-0.2 ${active ? 'bg-white/20 text-white' : 'bg-well text-ink-subtle'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 手风琴列表 */}
          <div className="mt-6 space-y-3">
            {filteredFaqs.map((item, index) => {
              const isOpen = openFaq === item.id;
              return (
                <div
                  key={item.id || index}
                  className={`overflow-hidden rounded-2xl border transition-[background-color,border-color,box-shadow] duration-base ${
                    isOpen
                      ? 'border-brand-line pricing-raised-bg shadow-elevation-2'
                      : 'border-line pricing-card-bg hover:border-line-strong'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left text-body-sm font-bold text-ink transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-well text-micro font-black text-ink-muted">
                        {index + 1}
                      </span>
                      <span>{item.question}</span>
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform duration-300 ease-in-out ${
                        isOpen ? 'rotate-180 text-brand' : 'text-ink-muted'
                      }`}
                    />
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-line-subtle px-5 pb-5 pt-3">
                        <p className="text-body-sm leading-6 text-ink-muted whitespace-pre-line">
                          {item.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-line-subtle pricing-panel-bg p-4 text-center sm:p-5">
            <p className="text-caption text-ink-muted">
              没有找到您需要的解答？欢迎联系我们：
              <a href="mailto:support@koyosim.com" className="ml-1 font-bold pricing-pink-text hover:underline">
                support@koyosim.com
              </a>
              ，我们将在工作日 2 小时内为您答复。
            </p>
          </div>
        </section>
      </main>

      {showAuthModal && (
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={handleAuthSuccess} />
      )}

      {checkout && (
        <RechargeModal
          key={`${checkout.type}:${checkout.id}:${checkout.billingCycle || billingCycle}`}
          isOpen
          initialTab={checkout.type === 'credit_pack' ? 'points' : 'sub'}
          initialPlanId={checkout.type === 'subscription' ? checkout.id : null}
          initialCreditPackId={checkout.type === 'credit_pack' ? checkout.id : null}
          initialBillingCycle={checkout.billingCycle || billingCycle}
          onClose={() => setCheckout(null)}
          onPaySuccess={loadInitialData}
        />
      )}
    </div>
  );
}
