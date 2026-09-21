import { getSystemHealth } from '@/lib/services/systemHealth';
import { Card, MetricCard, PageHeader, StatusBadge } from '@/components/admin/AdminUi';
import LiveLogViewer from './LiveLogViewer';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function SystemHealthPage() {
  await requireAdminPagePermission(PERMISSIONS.healthRead);
  const { database, migrations, providers } = await getSystemHealth();
  const mem = process.memoryUsage();
  const databaseLatency = database.latencyMs == null ? '—' : `${database.latencyMs} ms`;
  const poolIdle = database.pool?.idle ?? 0;
  const poolMax = database.pool?.max ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="系统运维"
        title="系统健康"
        description="查看 Next.js 服务进程、PostgreSQL 连接池与迁移账本状态及外部服务依赖可用性。"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard
          label="服务核心状态"
          value={database.ok && migrations.ok ? '正常在线' : '降级运行'}
          hint={`运行时: Node ${process.version}`}
          tone="good"
        />
        <MetricCard
          label="数据库查询延时"
          value={databaseLatency}
          hint={`PostgreSQL 16 · 连接池 ${poolIdle}/${poolMax} 空闲`}
          tone="info"
        />
        <MetricCard
          label="迁移账本"
          value={migrations.ok ? '已同步' : `${migrations.pending.length} 项待执行`}
          hint={migrations.latest || '无迁移记录'}
        />
        <MetricCard
          label="内存 RSS 占用"
          value={`${Math.round(mem.rss / 1024 / 1024)} MB`}
          hint={`堆占用: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-bold text-ink mb-4">外部依赖与网关健康摘要</h2>
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-black/20 p-3.5">
                <div>
                  <p className="text-xs font-semibold text-ink">{p.name}</p>
                  <p className="text-[11px] text-ink-subtle">{p.description}</p>
                </div>
                <StatusBadge tone={p.configured ? 'good' : 'warn'}>
                  {p.configured ? '已就绪' : '待配置'}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-ink mb-4">运行环境与安全规则</h2>
          <div className="space-y-2.5 text-xs text-ink-muted">
            <div className="flex justify-between border-b border-line-subtle pb-2">
              <span className="text-ink-subtle">应用协议模式</span>
              <span>Next.js 15 全栈 App Router</span>
            </div>
            <div className="flex justify-between border-b border-line-subtle pb-2">
              <span className="text-ink-subtle">监听地址</span>
              <span className="font-mono">127.0.0.1:3100 (Nginx 反向代理)</span>
            </div>
            <div className="flex justify-between border-b border-line-subtle pb-2">
              <span className="text-ink-subtle">数据库事务隔离</span>
              <span>PostgreSQL 事务 + 连接池超时</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-ink-subtle">代理策略</span>
              <span>服务器内网直连 (NO_PROXY 保障)</span>
            </div>
          </div>
        </Card>
      </div>

      <LiveLogViewer />
    </>
  );
}
