import Link from 'next/link';
import { isChinaIp, isLoopbackOrPrivate, isIpInWhitelist } from '@/lib/security/chinaIpBlock';

export default function ChinaIpGate({ chinaIpConfig, user, clientIp, headers, children }) {
  if (!chinaIpConfig?.enabled) {
    return children;
  }

  // 管理员账号享有特权穿透通行权限
  const isAdmin = user && ['super_admin', 'admin', 'operations_admin', 'finance_admin', 'support_admin', 'auditor'].includes(user.role);

  if (isAdmin) {
    return (
      <>
        <div className="bg-warning-soft border-b border-warning-line px-4 py-1.5 text-center text-xs font-semibold text-warning">
          🛡️ 中国大陆 IP 拦截已开启（境内普通访客已被阻断，ICP备案保护中），当前正在以管理员权限（{user.email}）通行
        </div>
        {children}
      </>
    );
  }

  // 白名单与内网检测
  if (isLoopbackOrPrivate(clientIp) || isIpInWhitelist(clientIp, chinaIpConfig.whitelist_ips)) {
    return children;
  }

  // 判定是否为中国大陆 IP
  const isChina = isChinaIp(clientIp, headers);
  if (!isChina) {
    return children;
  }

  const isForbiddenMode = chinaIpConfig.action === 'forbidden';
  const customMessage = chinaIpConfig.custom_message || '网站正在办理工信部ICP备案审核，暂不对中国大陆境内用户提供访问服务。';

  if (isForbiddenMode) {
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#fff',
          color: '#000',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '20px',
        }}
      >
        <h1 style={{ fontSize: '2em', fontWeight: 'bold', margin: '0.67em 0' }}>403 Forbidden</h1>
        <hr style={{ width: '100%', maxWidth: '600px', borderColor: '#ccc', margin: '1em 0' }} />
        <div style={{ textAlign: 'center', fontSize: '0.9em', color: '#555' }}>nginx</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center text-ink selection:bg-brand-active selection:text-ink-on-accent">
      <div className="relative mx-auto w-full max-w-lg rounded-3xl border border-line bg-wash p-8 md:p-10 backdrop-blur-2xl shadow-elevation-4">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-line bg-brand-soft text-brand-hover">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-brand-hover">
          ICP Filing Compliance Gate
        </p>

        <h1 className="mt-3 text-2xl font-black text-ink">网站备案建设中</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {customMessage}
        </p>

        <div className="mt-6 rounded-2xl border border-line-subtle bg-scrim p-4 text-left text-xs text-ink-subtle space-y-2">
          <div className="flex justify-between">
            <span className="text-ink-subtle">监管审核事项</span>
            <span className="text-ink font-medium">工信部网站备案审核</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-subtle">访问限制区域</span>
            <span className="text-ink font-medium">中国大陆 (Mainland China)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-subtle">预计恢复时间</span>
            <span className="text-warning font-medium">待管局审核批准下发备案号后</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
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
