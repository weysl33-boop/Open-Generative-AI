import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '@/lib/billing';
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
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            KoyoSIM AI Studio
          </p>
          <h1 className="mt-3 text-2xl font-bold">暂无后台访问权限</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            当前登录账户身份为普通用户（{user.email}），无权访问运营管理后台。
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/studio"
              className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-200"
            >
              返回 Studio
            </a>
            <a
              href="/account"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
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
