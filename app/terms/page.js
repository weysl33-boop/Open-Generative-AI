import Link from 'next/link';
import StudioHeader, { PageEyebrow } from '@/components/site/StudioHeader';

export const metadata = { title: '服务条款 | koyosim' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <StudioHeader title="法律合规" subtitle="服务条款与使用协议" />
      
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-line bg-surface/80 p-6 sm:p-10 shadow-elevation-4 backdrop-blur-md">
          <div className="border-b border-line pb-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <PageEyebrow>SaaS Service Agreement</PageEyebrow>
              <span className="text-xs text-ink-subtle font-mono">v2.4 · 2026-09-16</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              <span className="font-jost font-medium">koyosim</span> 平台服务条款
            </h1>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              欢迎使用 <span className="font-jost font-medium">koyosim</span> 生成式人工智能创作工作台。在访问或使用我们的各项多模态模型与创作者工具前，请仔细阅读本服务条款。
            </p>
          </div>

          <section className="space-y-8 text-sm leading-relaxed text-ink">
            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                1. 服务范围与平台定位
              </h2>
              <p className="text-ink-muted">
                本平台为创作者提供包括但不限于多模态图像生成、高清视频制作、音频合成、Agent 智能体编排与工作流设计等专业服务。平台支持接入自建算力及授权第三方供应商模型接口，具体可用模型目录与算力配额以实际控制台界面呈现为准。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                2. 创作者权利与内容合规
              </h2>
              <p className="text-ink-muted">
                用户对其通过本服务输入的提示词、参考图像素材享有合法使用权，并保证内容符合适用法律法规及社会主义核心价值观。严禁利用本服务制作、传播涉嫌侵权、欺诈、色情、暴力、恶意代码或危害公共安全的内容。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                3. 额度消耗、账本对账与可用性
              </h2>
              <p className="text-ink-muted">
                所有模型调用任务严格执行分布式事务锁与双重额度对账机制（预扣-确认-失败释放）。如因上游模型服务超时或异常中断导致任务终态失败，系统将自动触发额度返还，保障创作者资产准确无误。
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-base/60 p-5">
              <h2 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                4. 知识产权与社区共享
              </h2>
              <p className="text-ink-muted">
                在您选择将个人生成资产公开发布至“即梦社区”时，即视为授予平台及其他社区创作者在站内进行非排他性的展示、灵感参考及参数同款复刻权利。个人保留作品在资产中心默认处于私密状态。
              </p>
            </div>
          </section>

          {/* 底部法律导航联动 */}
          <div className="mt-10 pt-6 border-t border-line flex flex-wrap items-center justify-between gap-4 text-xs text-ink-subtle">
            <div>© 2026 <span className="font-jost font-medium">koyosim</span> · 保留所有权利</div>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-brand transition-colors">隐私政策</Link>
              <Link href="/refund" className="hover:text-brand transition-colors">退款政策</Link>
              <Link href="/content-policy" className="hover:text-brand transition-colors">内容安全准则</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
