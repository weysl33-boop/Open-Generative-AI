import Link from 'next/link';
import StudioHeader, { PageEyebrow } from '@/components/site/StudioHeader';

export const metadata = { title: '退款政策与资产保障 | koyosim' };

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <StudioHeader title="法律合规" subtitle="充值订阅退款与额度保障细则" />
      
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-line bg-surface/80 p-6 sm:p-10 shadow-elevation-4 backdrop-blur-md">
          <div className="border-b border-line pb-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <PageEyebrow>Refund & Protection Policy</PageEyebrow>
              <span className="text-xs text-ink-subtle font-mono">v2.4 · 2026-09-16</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              <span className="font-jost font-medium">koyosim</span> 充值退款与算力保障规则
            </h1>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              为维护健康、公平、透明的创作者生态，保障用户合法消费权益，本政策详细说明关于会员订阅、算力加油包与任务生成失败的结算保障机制。
            </p>
          </div>

          <section className="space-y-8 text-sm leading-relaxed text-ink">
            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                1. 生成失败 100% 自动释放返还
              </h2>
              <p className="text-ink-muted">
                平台任务状态机采用精确的“预扣（Reserve）- 确认（Commit）- 释放（Release）”三阶段资产控制。若模型由于算力拥塞、供应商故障或非法敏感词拦截等非用户原因未能产出成功作品，系统会在任务标记为失败的毫秒级时间内全额返还预扣额度。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                2. 算力加油包充值规则
              </h2>
              <p className="text-ink-muted">
                通过官方收银台充值的算力加油包支持永久保留在您的个人钱包中。充值后若未使用任何额度，自购买之日起 7 个自然日内可联系客服申请原路退款；若已发生生成任务消耗，已消耗部分及对应折扣差额不支持退还。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                3. 会员订阅周期与退订管理
              </h2>
              <p className="text-ink-muted">
                月卡与年卡会员可在账户中心随时取消“下期自动续费”。取消后您当前的 VIP 权益与每日赠送算力将持续有效直至本账期结束，次月将不再自动扣费。
              </p>
            </div>
          </section>

          {/* 底部法律导航联动 */}
          <div className="mt-10 pt-6 border-t border-line flex flex-wrap items-center justify-between gap-4 text-xs text-ink-subtle">
            <div>© 2026 <span className="font-jost font-medium">koyosim</span> · 保留所有权利</div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-brand transition-colors">服务条款</Link>
              <Link href="/privacy" className="hover:text-brand transition-colors">隐私政策</Link>
              <Link href="/content-policy" className="hover:text-brand transition-colors">内容安全准则</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
