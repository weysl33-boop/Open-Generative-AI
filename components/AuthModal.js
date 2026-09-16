'use client';

import { useEffect, useState, useRef } from 'react';
import { GoogleIcon, XIcon, TikTokIcon } from './SocialIcons';

const COUNTRY_CODES = [
  { code: '+86', label: '中国大陆 (+86)' },
  { code: '+1', label: '美国 / 加拿大 (+1)' },
  { code: '+852', label: '中国香港 (+852)' },
  { code: '+886', label: '中国台湾 (+886)' },
  { code: '+81', label: '日本 (+81)' },
  { code: '+65', label: '新加坡 (+65)' },
  { code: '+44', label: '英国 (+44)' },
];

const PROVIDERS = [
  { id: 'google', label: '谷歌登录', icon: GoogleIcon, hover: 'hover:border-blue-500/40 hover:bg-blue-500/10' },
  { id: 'x', label: 'X 登录', icon: XIcon, hover: 'hover:border-white/40 hover:bg-white/10' },
  { id: 'tiktok', label: 'TikTok 登录', icon: TikTokIcon, hover: 'hover:border-pink-500/40 hover:bg-pink-500/10' },
];

// 图2灵动萌宠 Mascot SVG
function MascotIcon() {
  return (
    <svg className="w-11 h-11 drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mascotGrad" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="60%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
      </defs>
      {/* 头部精灵轮廓与头顶芽 */}
      <path
        d="M50 8C48 16 38 24 38 32C38 34 39 36 40 37C26 42 16 55 16 70C16 86 31 95 50 95C69 95 84 86 84 70C84 55 74 42 60 37C61 36 62 34 62 32C62 24 52 16 50 8Z"
        fill="url(#mascotGrad)"
      />
      {/* 脸部高光与红晕 */}
      <ellipse cx="28" cy="71" rx="5" ry="3" fill="#f472b6" opacity="0.6" />
      <ellipse cx="72" cy="71" rx="5" ry="3" fill="#f472b6" opacity="0.6" />
      {/* 灵动大眼睛 */}
      <circle cx="37" cy="62" r="6.5" fill="#064e3b" />
      <circle cx="63" cy="62" r="6.5" fill="#064e3b" />
      <circle cx="39" cy="60" r="2.5" fill="#ffffff" />
      <circle cx="65" cy="60" r="2.5" fill="#ffffff" />
      <circle cx="35.5" cy="64" r="1.2" fill="#ffffff" />
      <circle cx="61.5" cy="64" r="1.2" fill="#ffffff" />
      {/* 萌宠小嘴 */}
      <path d="M44 72 Q50 78 56 72" stroke="#064e3b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* 招手小手掌 */}
      <path
        d="M80 62C85 58 92 60 93 66C94 70 90 75 83 73"
        fill="#34d399"
        stroke="#059669"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function AuthModal({ onSuccess, onClose }) {
  // tab: 'phone' | 'email'
  const [activeTab, setActiveTab] = useState('phone');
  
  // 手机号登录/注册状态
  const [countryCode, setCountryCode] = useState('+86');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  // 邮箱登录/注册状态
  const [emailMode, setEmailMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 通用交互状态
  const [message, setMessage] = useState('');
  const [devCodeTip, setDevCodeTip] = useState('');
  const [busy, setBusy] = useState(false);

  // 倒计时清理
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 跨窗口接收 OAuth 回调
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'koyosim-auth-complete') return;
      if (!event.data.ok) {
        setMessage(event.data.message || '第三方登录未成功，请重试');
        return;
      }
      fetch('/api/auth/me', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => {
          if (data.user) {
            onSuccess?.(data.user, data.entitlements);
          } else {
            setMessage('登录状态同步失败，请重试');
          }
        })
        .catch(() => setMessage('登录状态同步失败，请重试'));
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onSuccess]);

  // 发送手机验证码
  const handleSendCode = async () => {
    if (countdown > 0 || busy) return;
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setMessage('请输入手机号');
      return;
    }
    setMessage('');
    setDevCodeTip('');
    setBusy(true);

    try {
      const res = await fetch('/api/auth/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, countryCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '验证码发送失败');

      // 启动 60 秒倒计时
      setCountdown(60);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      if (data.devCode) {
        setDevCodeTip(`[开发测试体验码: ${data.devCode}]`);
        setCode(data.devCode);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 提交主操作按钮（创建账户 / 登录）
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      if (activeTab === 'phone') {
        const cleanPhone = phone.trim();
        const cleanCode = code.trim();
        if (!cleanPhone) throw new Error('请输入手机号');
        if (!cleanCode) throw new Error('请输入短信验证码');

        const res = await fetch('/api/auth/phone/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, countryCode, code: cleanCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '验证码错误或已失效');

        onSuccess?.(data.user, null);
      } else {
        // 邮箱处理
        const cleanEmail = email.trim();
        if (!cleanEmail) throw new Error('请输入邮箱地址');
        if (!password || password.length < 8) throw new Error('密码长度至少为 8 位');

        const endpoint = emailMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (emailMode === 'login' && data.error?.includes('邮箱或密码不正确')) {
            throw new Error('邮箱或密码不正确，新用户请点击下方切换为「注册账户」');
          }
          throw new Error(data.error || '认证失败');
        }

        onSuccess?.(data.user, null);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 第三方登录唤起
  const handleSocialLogin = (provider) => {
    setMessage('');
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const url = `/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
    const popup = window.open(url, 'koyosim-oauth', 'popup,width=520,height=720');
    if (!popup) window.location.assign(url);
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      {/* 弹窗卡片容器：点阵网格微纹理 + 极简暗黑质感（参考图2） */}
      <div className="relative w-full max-w-[440px] rounded-3xl border border-white/10 bg-[#121316]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-hidden [background-image:radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px]">
        
        {/* 右上角关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>

        {/* 顶部卡通 Mascot + 胶囊气泡（严格对齐图2） */}
        <div className="mb-6 flex items-center justify-center gap-3 pt-1">
          <div className="flex-shrink-0 animate-bounce-short">
            <MascotIcon />
          </div>
          <div className="relative rounded-full bg-[#1c1e24] px-4 py-1.5 shadow-md border border-white/10">
            {/* 气泡指向小三角形 */}
            <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px] border-r-[#1c1e24]" />
            <span className="text-sm font-bold text-white tracking-wide">
              注册 / 登录领积分哦
            </span>
          </div>
        </div>

        {/* 双 Tab 胶囊切换：[ 手机号 ]  [ 邮箱 ] */}
        <div className="mb-5 flex justify-center">
          <div className="inline-flex rounded-full bg-[#1a1b20] p-1 border border-white/5 shadow-inner">
            <button
              type="button"
              onClick={() => { setActiveTab('phone'); setMessage(''); }}
              className={`rounded-full px-6 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'phone'
                  ? 'bg-[#2b2d35] text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              手机号
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('email'); setMessage(''); }}
              className={`rounded-full px-6 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'email'
                  ? 'bg-[#2b2d35] text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              邮箱
            </button>
          </div>
        </div>

        {/* 登录与注册表单 */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {activeTab === 'phone' ? (
            <>
              {/* 手机号输入框（带区号选择） */}
              <div className="flex h-12 w-full items-center rounded-xl border border-white/5 bg-[#1b1c21] px-3.5 focus-within:border-white/20 transition">
                <div className="flex items-center gap-1 border-r border-white/10 pr-2.5 mr-2.5">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-white/90 outline-none cursor-pointer"
                  >
                    {COUNTRY_CODES.map((item) => (
                      <option key={item.code} value={item.code} className="bg-[#1b1c21] text-white">
                        {item.code}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                />
              </div>

              {/* 验证码输入框（内嵌获取验证码按钮） */}
              <div className="flex h-12 w-full items-center rounded-xl border border-white/5 bg-[#1b1c21] px-3.5 focus-within:border-white/20 transition">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="请输入验证码"
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                />
                <div className="h-4 w-px bg-white/10 mx-2 flex-shrink-0" />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || busy}
                  className="flex-shrink-0 text-xs font-medium text-white/60 hover:text-white transition disabled:cursor-not-allowed disabled:text-white/30"
                >
                  {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 邮箱输入框 */}
              <div className="flex h-12 w-full items-center rounded-xl border border-white/5 bg-[#1b1c21] px-3.5 focus-within:border-white/20 transition">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱地址"
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                />
              </div>

              {/* 密码输入框 */}
              <div className="flex h-12 w-full items-center rounded-xl border border-white/5 bg-[#1b1c21] px-3.5 focus-within:border-white/20 transition">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={emailMode === 'register' ? '设置登录密码（至少8位）' : '请输入密码'}
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
                />
              </div>

              {/* 邮箱模式微调切换 */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode(emailMode === 'login' ? 'register' : 'login');
                    setMessage('');
                  }}
                  className="text-[11px] text-white/40 hover:text-white/75 transition"
                >
                  {emailMode === 'login' ? '没有账号？切换为邮箱注册' : '已有账号？切换为邮箱登录'}
                </button>
              </div>
            </>
          )}

          {/* 开发测试验证码提示 */}
          {devCodeTip && (
            <div className="text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1 text-center font-mono">
              {devCodeTip}
            </div>
          )}

          {/* 错误提示 */}
          {message && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 text-center">
              {message}
            </div>
          )}

          {/* 主操作按钮（图2品红/渐变高亮） */}
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-xl bg-[#b71676] hover:bg-[#c91882] active:scale-[0.99] text-sm font-bold text-white shadow-lg shadow-[#b71676]/20 transition-all disabled:opacity-50 disabled:cursor-wait mt-1"
          >
            {busy ? '处理中…' : '创建账户 / 登录'}
          </button>
        </form>

        {/* 分割线：其他登录方式 */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/5" />
          <span className="text-[11px] text-white/40">其他登录方式</span>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        {/* 三方登录药丸胶囊按钮组（Google、TikTok、X） */}
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSocialLogin(item.id)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/5 bg-[#1b1c21] text-xs font-medium text-white/80 transition-all ${item.hover}`}
              >
                <Icon size={16} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 底部协议说明（图2极简风格） */}
        <div className="mt-5 text-center text-[11px] text-white/35">
          继续即表示您同意{' '}
          <a href="/terms" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white underline underline-offset-2">
            用户协议
          </a>{' '}
          与{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white underline underline-offset-2">
            隐私政策
          </a>
        </div>
      </div>
    </div>
  );
}
