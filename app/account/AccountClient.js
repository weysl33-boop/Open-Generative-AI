'use client';

import { useEffect, useState, useRef } from 'react';
import { GoogleIcon, XIcon, TikTokIcon } from '@/components/SocialIcons';

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
      <path
        d="M50 8C48 16 38 24 38 32C38 34 39 36 40 37C26 42 16 55 16 70C16 86 31 95 50 95C69 95 84 86 84 70C84 55 74 42 60 37C61 36 62 34 62 32C62 24 52 16 50 8Z"
        fill="url(#mascotGrad)"
      />
      <ellipse cx="28" cy="71" rx="5" ry="3" fill="#f472b6" opacity="0.6" />
      <ellipse cx="72" cy="71" rx="5" ry="3" fill="#f472b6" opacity="0.6" />
      <circle cx="37" cy="62" r="6.5" fill="#064e3b" />
      <circle cx="63" cy="62" r="6.5" fill="#064e3b" />
      <circle cx="39" cy="60" r="2.5" fill="#ffffff" />
      <circle cx="65" cy="60" r="2.5" fill="#ffffff" />
      <circle cx="35.5" cy="64" r="1.2" fill="#ffffff" />
      <circle cx="61.5" cy="64" r="1.2" fill="#ffffff" />
      <path d="M44 72 Q50 78 56 72" stroke="#064e3b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M80 62C85 58 92 60 93 66C94 70 90 75 83 73" fill="#34d399" stroke="#059669" strokeWidth="1.5" />
    </svg>
  );
}

export default function AccountClient() {
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(null);

  // 表单状态
  const [activeTab, setActiveTab] = useState('phone');
  const [countryCode, setCountryCode] = useState('+86');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  const [emailMode, setEmailMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [message, setMessage] = useState('');
  const [devCodeTip, setDevCodeTip] = useState('');
  const [busy, setBusy] = useState(false);

  // 个人资料与创作资产扩展状态
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileStats, setProfileStats] = useState({ totalCreations: 0, publishedPosts: 0, totalLikes: 0 });

  const loadAccount = async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await response.json();
      setUser(data.user || null);
      setCredits(data.entitlements?.credits ?? (data.user ? data.user.credits : null));

      if (data.user) {
        setProfileName(data.user.displayName || '');
        const profileRes = await fetch('/api/user/profile', { cache: 'no-store' }).catch(() => null);
        if (profileRes && profileRes.ok) {
          const pData = await profileRes.json();
          if (pData.user) {
            setProfileBio(pData.user.bio || '');
            if (pData.user.stats) {
              setProfileStats(pData.user.stats);
            }
          }
        }
      }
    } catch {
      setMessage('账户状态加载失败，请刷新重试');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: profileName, bio: profileBio }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('个人资料已成功更新！');
        setEditingProfile(false);
        await loadAccount();
      } else {
        setMessage(data.error || '更新失败');
      }
    } catch {
      setMessage('网络请求失败');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadAccount();
    if (typeof window !== 'undefined') {
      const authError = new URLSearchParams(window.location.search).get('auth_error');
      if (authError) setMessage(authError);
    }
    const handleOAuthMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'koyosim-auth-complete') return;
      if (event.data.ok) {
        loadAccount();
        setMessage('登录成功！已同步账户状态');
      } else {
        setMessage(event.data.message || '第三方登录未成功，请重试');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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
        await loadAccount();
        setMessage('登录成功！');
      } else {
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
        await loadAccount();
        setMessage('登录成功！');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const socialLogin = (provider) => {
    setMessage('');
    const returnTo = `${window.location.pathname}`;
    const url = `/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
    const popup = window.open(url, 'koyosim-oauth', 'popup,width=520,height=720');
    if (!popup) window.location.assign(url);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCredits(null);
    setMessage('已安全退出登录');
  };

  return (
    <main className="min-h-screen bg-[#030303] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">KoyoSIM AI Studio</p>
            <h1 className="text-3xl font-bold tracking-tight">账户与用户中心</h1>
            <p className="mt-2 text-sm text-white/55">多账号快捷登录，额度资产统一管理，BYOK 始终本地保留。</p>
          </div>
          <a className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/75 hover:bg-white/10" href="/studio">返回 Studio</a>
        </header>

        {message && (
          <div role="status" className="mb-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100 flex items-center justify-between">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="text-cyan-300/60 hover:text-cyan-200 text-xs">✕</button>
          </div>
        )}

        {!user ? (
          /* 未登录：图2极简卡片 */
          <div className="mx-auto max-w-[440px] rounded-3xl border border-white/10 bg-[#121316]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-hidden [background-image:radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px]">
            {/* 顶部 Mascot + 气泡 */}
            <div className="mb-6 flex items-center justify-center gap-3 pt-1">
              <div className="flex-shrink-0 animate-bounce-short">
                <MascotIcon />
              </div>
              <div className="relative rounded-full bg-[#1c1e24] px-4 py-1.5 shadow-md border border-white/10">
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px] border-r-[#1c1e24]" />
                <span className="text-sm font-bold text-white tracking-wide">
                  注册 / 登录领积分哦
                </span>
              </div>
            </div>

            {/* 双 Tab 切换 */}
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

            {/* 表单 */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {activeTab === 'phone' ? (
                <>
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

              {devCodeTip && (
                <div className="text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1 text-center font-mono">
                  {devCodeTip}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-[#b71676] hover:bg-[#c91882] active:scale-[0.99] text-sm font-bold text-white shadow-lg shadow-[#b71676]/20 transition-all disabled:opacity-50 disabled:cursor-wait mt-1"
              >
                {busy ? '处理中…' : '创建账户 / 登录'}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[11px] text-white/40">其他登录方式</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => socialLogin(item.id)}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/5 bg-[#1b1c21] text-xs font-medium text-white/80 transition-all ${item.hover}`}
                  >
                    <Icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 text-center text-[11px] text-white/35">
              继续即表示您同意 <a href="/terms" className="underline">用户协议</a> 与 <a href="/privacy" className="underline">隐私政策</a>
            </div>
          </div>
        ) : (
          /* 已登录：用户资产与多渠道凭据展示 */
          <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#121316]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
              <div className="flex-1">
                <p className="text-xs text-white/40">当前登录用户</p>
                <div className="flex items-center gap-3 mt-1">
                  <h2 className="text-2xl font-bold text-white">{user.displayName || 'AI 创作者'}</h2>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(!editingProfile)}
                    className="text-xs text-cyan-300 hover:text-cyan-200 border border-cyan-400/30 rounded-lg px-2.5 py-1 bg-cyan-400/10 transition"
                  >
                    {editingProfile ? '取消编辑' : '✏️ 编辑资料'}
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/60">
                  {user.email && <span>✉️ {user.email}</span>}
                  {user.phone && <span>📱 {user.phoneCountryCode || '+86'} {user.phone}</span>}
                </div>
                {profileBio && !editingProfile && (
                  <p className="mt-2 text-xs text-white/70 italic bg-white/[0.03] p-2.5 rounded-xl border border-white/5 max-w-md">
                    "{profileBio}"
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  ['admin', 'super_admin', 'ops', 'finance'].includes(user.role)
                    ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
                    : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                }`}>
                  {user.role === 'super_admin' ? '👑 超级管理员' : user.role === 'admin' ? '🛡️ 管理员' : '已认证用户'}
                </span>
              </div>
            </div>

            {/* 编辑个人简介表单 */}
            {editingProfile && (
              <form onSubmit={handleSaveProfile} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">更新个人主页信息</h4>
                <div>
                  <label className="text-xs text-white/50 block mb-1">展示昵称</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    maxLength={30}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    placeholder="输入您的昵称"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">个人简介 (Bio)</label>
                  <textarea
                    rows={2}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    maxLength={150}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    placeholder="分享你的创作风格、主页或擅长领域..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
                  >
                    保存资料
                  </button>
                </div>
              </form>
            )}

            {/* 个人创作资产与即梦社区两大功能卡片 */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href="/creations"
                className="group rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-950/20 to-black/40 p-4 hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-500/10 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl">🎨</span>
                    <span className="text-[11px] font-mono text-cyan-300 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-full">
                      {profileStats.totalCreations} 件作品
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-2 group-hover:text-cyan-300 transition">
                    个人作品资产库
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    集中管理所有生图、视频、音频作品，支持一键发布分享到社区。
                  </p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-cyan-300">
                  <span>查看作品列表 →</span>
                </div>
              </a>

              <a
                href="/community"
                className="group rounded-2xl border border-white/10 bg-gradient-to-br from-purple-950/20 to-black/40 p-4 hover:border-purple-400/40 hover:shadow-lg hover:shadow-purple-500/10 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl">🔥</span>
                    <span className="text-[11px] font-mono text-pink-300 bg-pink-400/10 border border-pink-400/20 px-2 py-0.5 rounded-full">
                      获赞 {profileStats.totalLikes}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-2 group-hover:text-purple-300 transition">
                    即梦创作社区
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    探索社区精选画廊与视频瀑布流，沉浸体验并一键同款生成。
                  </p>
                </div>
                <div className="mt-3 flex items-center text-xs font-semibold text-purple-300">
                  <span>发现灵感与做同款 →</span>
                </div>
              </a>
            </div>

            {/* 运营标签展示 */}
            {user.tags && user.tags.length > 0 && (
              <div className="mt-5">
                <p className="text-xs text-white/40 mb-2">我的用户标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {user.tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                      style={{ backgroundColor: `${t.color}25`, borderColor: `${t.color}50`, borderWidth: 1 }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span>{t.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 额度资产卡片 */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/50">可用模型额度</p>
                  <p className="mt-1 text-3xl font-black text-cyan-300">{credits ?? '10'}</p>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200">
                  ⚡ 充值与用量实时扣减
                </div>
              </div>
              <p className="mt-3 text-xs text-white/40">
                每次调用模型扣减相应额度；同时也支持在 Studio 侧边栏自带模型 Key（BYOK）。
              </p>
            </div>

            {/* 已绑定登录渠道 */}
            <div className="mt-6">
              <p className="text-xs text-white/40 mb-2">已绑定的登录方式 (1:N 凭据)</p>
              <div className="flex flex-wrap gap-2">
                {(user.loginProviders || ['phone']).map((p) => {
                  const labels = {
                    phone: '📱 手机短信一键登录',
                    email: '✉️ 邮箱密码登录',
                    google: '🔵 Google 快捷登录',
                    tiktok: '🎵 TikTok 快捷登录',
                    x: '𝕏 X (Twitter) 快捷登录',
                  };
                  return (
                    <span key={p} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80">
                      {labels[p] || p}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* 底部操作区 */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="/studio"
                className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-200 transition"
              >
                进入 Studio 开始创作
              </a>
              {['admin', 'super_admin', 'ops', 'finance', 'support', 'compliance', 'operations_admin'].includes(user.role) && (
                <a
                  href="/admin"
                  className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-bold text-amber-200 hover:bg-amber-400/20 transition flex items-center gap-1.5"
                >
                  🛡️ 进入管理中台 →
                </a>
              )}
              <button
                type="button"
                onClick={logout}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition"
              >
                退出登录
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
