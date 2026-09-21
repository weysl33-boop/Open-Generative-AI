import Link from 'next/link';
import StudioHeader, { PageEyebrow } from '@/components/site/StudioHeader';

export const metadata = { title: '隐私政策 | koyosim' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <StudioHeader title="法律合规" subtitle="数据隐私与用户信息保护政策" />
      
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-line bg-surface/80 p-6 sm:p-10 shadow-elevation-4 backdrop-blur-md">
          <div className="border-b border-line pb-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <PageEyebrow>Privacy & Security</PageEyebrow>
              <span className="text-xs text-ink-subtle font-mono">v2.4 · 2026-09-16</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              <span className="font-jost font-medium">koyosim</span> 平台隐私保护政策
            </h1>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              <span className="font-jost font-medium">koyosim</span> 深知个人隐私及生成创意数据对创作者的重要性。本政策旨在透明阐述我们如何收集、加密存储、保护以及处理您的账户凭据与任务数据。
            </p>
          </div>

          <section className="space-y-8 text-sm leading-relaxed text-ink">
            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                1. 数据收集与最小必要原则
              </h2>
              <p className="text-ink-muted">
                我们仅出于向您提供服务所必需收集信息：包括注册登录使用的邮箱或手机号、生成任务的历史输入参数（Prompt、分辨率、步数）、生成产物地址以及支付对账订单信息。我们严格执行银行级单向哈希加密存储密码。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                2. 上游模型供应商交互安全
              </h2>
              <p className="text-ink-muted">
                当您提交生成任务时，必要的提示词与参考图片将通过安全加密通道（TLS 1.3）传输至对应的算力集群或模型供应商。我们不会将用户专有私密资产或输入用于未经授权的公开模型通用训练。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                3. Cookie 与会话令牌保护
              </h2>
              <p className="text-ink-muted">
                平台采用具备 HttpOnly 与 SameSite 保护的会话 Cookie，支持全站同源防御（CSRF 请求门禁）。创作者可随时在账户中心安全注销登录或下线特定设备活跃会话。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                4. 创作者数据权利与账户注销
              </h2>
              <p className="text-ink-muted">
                创作者拥有对其资产数据的完整知情权与删除权。您可以在个人作品中心随时导出、下架或彻底物理删除历史创作记录，或联系技术支持申请注销账户。
              </p>
            </div>
          </section>

          {/* 底部法律导航联动 */}
          <div className="mt-10 pt-6 border-t border-line flex flex-wrap items-center justify-between gap-4 text-xs text-ink-subtle">
            <div>© 2026 <span className="font-jost font-medium">koyosim</span> · 保留所有权利</div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-brand transition-colors">服务条款</Link>
              <Link href="/refund" className="hover:text-brand transition-colors">退款政策</Link>
              <Link href="/content-policy" className="hover:text-brand transition-colors">内容安全准则</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
