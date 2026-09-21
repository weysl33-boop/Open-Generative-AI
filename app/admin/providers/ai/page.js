import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import ProviderCard from '../ProviderCard';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

export default async function AiProvidersPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const allProviders = await getProvidersOverview();
  const aiProviders = allProviders.filter((p) => p.kind === 'ai');

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="AI 供应商 (基础)"
        description="查看 AI 大模型后端驱动（MuAPI、本地模型服务等）配置健康状态。支持一键心跳探针与写入式安全密钥轮换。"
      />

      <div className="mb-6 rounded-2xl border border-brand-line bg-brand-soft p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-pressed text-brand-hover">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">已升级统一 AI 模型中台与混合多渠道架构</h4>
              <p className="text-xs text-ink-muted">
                支持管理各大官方直连驱动（DashScope、MiniMax、Kling、OpenAI 等）、密钥 AES-256 加密入库、智能 Failover 路由与健康探针。
              </p>
            </div>
          </div>
          <Link
            href="/admin/models/providers"
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-ink-on-accent transition hover:bg-brand"
          >
            <span>进入 AI 混合供应商中台</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {aiProviders.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}
