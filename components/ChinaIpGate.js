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
        <div className="bg-amber-500/20 border-b border-amber-500/40 px-4 py-1.5 text-center text-xs font-semibold text-amber-300">
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-4 text-center text-white selection:bg-cyan-500 selection:text-black">
      <div className="relative mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10 backdrop-blur-2xl shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          ICP Filing Compliance Gate
        </p>

        <h1 className="mt-3 text-2xl font-black text-white">网站备案建设中</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {customMessage}
        </p>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black/40 p-4 text-left text-xs text-white/50 space-y-2">
          <div className="flex justify-between">
            <span className="text-white/40">监管审核事项</span>
            <span className="text-white/80 font-medium">工信部网站备案审核</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">访问限制区域</span>
            <span className="text-white/80 font-medium">中国大陆 (Mainland China)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">预计恢复时间</span>
            <span className="text-amber-400 font-medium">待管局审核批准下发备案号后</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/account"
            className="rounded-xl border border-white/10 py-2.5 text-xs font-medium text-white/50 hover:bg-white/5 hover:text-white transition"
          >
            管理员 / 团队入口登录 →
          </Link>
        </div>
      </div>
    </div>
  );
}
