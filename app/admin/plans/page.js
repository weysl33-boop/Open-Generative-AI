import { getAllPlansConfig } from '@/lib/repositories/settings';
import { Card, PageHeader, StatusBadge } from '@/components/admin/AdminUi';
import PlanCardEditor from './PlanCardEditor';

export default async function PlansPage() {
  const plans = await getAllPlansConfig();

  return (
    <>
      <PageHeader
        eyebrow="前端与权益管理"
        title="套餐配置"
        description="管理 Studio 前台会员与订阅套餐展示，包括名称、价格、权益特性列表及展示显隐开关。"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCardEditor key={plan.id} plan={plan} />
        ))}
      </div>
    </>
  );
}
