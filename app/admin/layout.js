import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '@/lib/services/auth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import AdminShell from '@/components/admin/AdminShell';

export const metadata = {
  title: '管理后台 | KoyoSIM AI Studio',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;
  const user = await getUserBySession(sessionToken);

  if (!user) {
    redirect('/account?next=/admin');
  }

  // 必须具备后台查看基本权限
  if (!hasPermission(user.role, PERMISSIONS.dashboardRead)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink">
        <div className="w-full max-w-md rounded-2xl border border-line bg-base/95 p-8 text-center shadow-elevation-4 shadow-black/60 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">
            KoyoSIM AI Studio
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em] leading-8 text-ink">暂无后台访问权限</h1>
          <p className="mt-3 text-sm leading-6 tracking-[-0.005em] text-ink-muted">
            当前登录账户身份为普通用户（{user.email}），无权访问运营管理后台。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/studio"
              className="inline-flex h-[38px] items-center rounded-lg bg-brand-active px-4 text-xs font-semibold text-ink-on-accent transition-all hover:bg-brand active:scale-[0.98]"
            >
              返回 Studio
            </a>
            <a
              href="/account"
              className="inline-flex h-[38px] items-center rounded-lg border border-line bg-wash px-4 text-xs font-medium text-ink transition-all hover:bg-wash-strong hover:text-ink active:scale-[0.98]"
            >
              切换账号
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
