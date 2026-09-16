import { getAllModelsOverview } from '@/lib/services/models';
import { PageHeader } from '@/components/admin/AdminUi';
import ModelsManagerClient from './ModelsManagerClient';

export const dynamic = 'force-dynamic';

export default function ModelsConfigPage() {
  const models = getAllModelsOverview();

  return (
    <>
      <PageHeader
        eyebrow="模型与计费中枢"
        title="模型开关与成本定价"
        description="管理 Studio 各模型（Hailuo 2.3、Kling 3.0 Pro、Veo 2、Flux 等）的启用状态、官方上游成本价（USD）以及向用户收取的 Credits 扣点数。"
      />

      <ModelsManagerClient initialModels={models} />
    </>
  );
}
