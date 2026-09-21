import Link from 'next/link';

export default function MaintenanceGate({ maintenance, user, children }) {
  if (!maintenance?.enabled) {
    return children;
  }

  // 管理员账号拥有维护期穿透通行权限，仅提示维护横幅
  const isAdmin = user && ['super_admin', 'operations_admin', 'finance_admin', 'support_admin', 'auditor'].includes(user.role);

  if (isAdmin) {
    return (
      <>
        <div className="bg-warning-soft border-b border-warning-line px-4 py-1.5 text-center text-xs font-semibold text-warning">
          ⚠️ 维护模式已开启（普通用户已被阻断），当前正在以管理员权限（{user.email}）预览与维护
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center text-ink selection:bg-brand-active selection:text-ink-on-accent">
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-line bg-wash p-8 backdrop-blur-2xl shadow-elevation-4">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-line bg-brand-soft text-brand-hover">
          <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-hover">
          KoyoSIM AI Studio
        </p>

        <h1 className="mt-3 text-2xl font-black text-ink">系统维护中</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {maintenance.message || '系统正在进行服务器性能升级与例行维护，请稍后刷新重试。'}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-ink-on-accent transition hover:bg-brand"
          >
            刷新页面
          </button>
          <Link
            href="/account"
            className="rounded-xl border border-line py-2.5 text-xs font-medium text-ink-subtle hover:bg-wash hover:text-ink transition"
          >
            管理员 / 团队入口登录 →
          </Link>
        </div>
      </div>
    </div>
  );
}
