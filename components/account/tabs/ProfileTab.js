'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, Hash, AlertTriangle, Camera, UploadCloud, Loader2 } from 'lucide-react';
import { GoogleIcon, XIcon, TikTokIcon, WeChatIcon, PhoneIcon, MailIcon } from '@/components/SocialIcons';

function SettingRow({ icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3.5 last:border-0 min-h-[62px]">
      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
        {icon && (
          <div className="size-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 shadow-inner">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-200 truncate">{title}</p>
          <p className="mt-0.5 text-xs text-gray-400 truncate">{description}</p>
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-end gap-2">
        {action}
      </div>
    </div>
  );
}

export default function ProfileTab({
  user,
  profileName,
  setProfileName,
  profileBio,
  setProfileBio,
  onSaveProfile,
  onProfileUpdated,
  busy,
}) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(user?.avatar || user?.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(null);
  const fileInputRef = useRef(null);

  const [currentProviders, setCurrentProviders] = useState(user?.loginProviders || ['phone']);
  const [currentAccounts, setCurrentAccounts] = useState(user?.authAccounts || []);
  const [currentPhone, setCurrentPhone] = useState(user?.phone || '');
  const [currentEmail, setCurrentEmail] = useState(user?.email || '');

  useEffect(() => {
    setCurrentAvatarUrl(user?.avatar || user?.avatar_url || null);
    if (user?.loginProviders) setCurrentProviders(user?.loginProviders);
    if (user?.authAccounts) setCurrentAccounts(user?.authAccounts);
    if (user?.phone) setCurrentPhone(user?.phone);
    if (user?.email) setCurrentEmail(user?.email);
  }, [user]);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  // 手机号与邮箱绑定弹窗状态
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [inputPhone, setInputPhone] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [phoneNotice, setPhoneNotice] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // 微信绑定与 Toast 状态
  const [wechatModalOpen, setWechatModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(''), 3000);
  }, []);

  // 监听第三方授权回调消息
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'koyosim-auth-complete') return;
      if (event.data.ok) {
        showToast(event.data.message || '第三方账号绑定成功！');
        fetch('/api/auth/me', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data.user) {
              if (data.user.authAccounts) setCurrentAccounts(data.user.authAccounts);
              if (data.user.loginProviders) setCurrentProviders(data.user.loginProviders);
              if (data.user.email) setCurrentEmail(data.user.email);
              if (data.user.phone) setCurrentPhone(data.user.phone);
              onProfileUpdated?.(data.user);
            }
          })
          .catch(() => {});
      } else {
        showToast(event.data.message || '第三方绑定未完成');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onProfileUpdated, showToast]);

  const handleConnectOAuth = (provider) => {
    if (oauthConnecting) return;
    setOauthConnecting(provider);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const url = `/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
    // 直接全页重定向，彻底规避浏览器弹窗拦截
    window.location.href = url;
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择有效的图片文件（JPG/PNG/WebP/GIF）');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('头像大小不能超过 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setAvatarUploading(true);
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.avatarUrl) {
        setCurrentAvatarUrl(data.avatarUrl);
        showToast('头像已更新，全站已同步生效！');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('user-profile-updated', {
              detail: { avatarUrl: data.avatarUrl, user: data.user },
            })
          );
        }
        onProfileUpdated?.(data.user);
      } else {
        showToast(data.error || '头像上传失败，请重试');
      }
    } catch {
      showToast('网络连接失败，请稍后重试');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentAvatarUrl(null);
        showToast('已恢复系统默认头像');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('user-profile-updated', {
              detail: { avatarUrl: null, user: data.user },
            })
          );
        }
        onProfileUpdated?.(data.user);
      } else {
        showToast(data.error || '重置头像失败');
      }
    } catch {
      showToast('网络连接失败，请重试');
    } finally {
      setAvatarUploading(false);
    }
  };

  // 解绑确认弹窗状态
  const [unbindTarget, setUnbindTarget] = useState(null); // { type: 'phone'|'email'|'oauth', provider: 'google', label: 'Google' }
  const [unbinding, setUnbinding] = useState(false);
  const [unbindError, setUnbindError] = useState('');

  const userNumber = user?.userNumber || '650410';

  const handleSendPhoneCode = async () => {
    if (!inputPhone) return setPhoneNotice('请输入手机号');
    setPhoneBusy(true);
    setPhoneNotice('');
    try {
      const res = await fetch('/api/auth/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: inputPhone, countryCode: '+86' }),
      });
      const data = await res.json();
      if (res.ok) {
        setPhoneNotice(data.notice || (data.devCode ? `验证码已发送（测试码: ${data.devCode}）` : '验证码已发送'));
      } else {
        setPhoneNotice(data.error || '验证码发送失败');
      }
    } catch {
      setPhoneNotice('网络请求异常');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleBindPhone = async (e) => {
    e.preventDefault();
    if (!inputPhone || !inputCode) return setPhoneNotice('请完整输入手机号与验证码');
    setPhoneBusy(true);
    try {
      const res = await fetch('/api/user/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: inputPhone, countryCode: '+86', code: inputCode }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('手机号绑定成功');
        setCurrentPhone(inputPhone);
        if (!currentProviders.includes('phone')) {
          setCurrentProviders([...currentProviders, 'phone']);
        }
        setPhoneModalOpen(false);
      } else {
        setPhoneNotice(data.error || '绑定失败');
      }
    } catch {
      setPhoneNotice('网络请求异常');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleBindEmail = async (e) => {
    e.preventDefault();
    if (!inputEmail) return setEmailNotice('请输入邮箱地址');
    setEmailBusy(true);
    try {
      const res = await fetch('/api/user/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('安全邮箱绑定成功');
        setCurrentEmail(inputEmail);
        if (!currentProviders.includes('email')) {
          setCurrentProviders([...currentProviders, 'email']);
        }
        setEmailModalOpen(false);
      } else {
        setEmailNotice(data.error || '绑定失败');
      }
    } catch {
      setEmailNotice('网络请求异常');
    } finally {
      setEmailBusy(false);
    }
  };

  // 执行解绑逻辑 (手机、邮箱、各社交账号)
  const confirmExecuteUnbind = async () => {
    if (!unbindTarget) return;
    setUnbinding(true);
    setUnbindError('');

    try {
      let url = '';
      if (unbindTarget.type === 'phone') url = '/api/user/phone';
      else if (unbindTarget.type === 'email') url = '/api/user/email';
      else if (unbindTarget.type === 'oauth') url = `/api/user/oauth/${unbindTarget.provider}`;

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        setUnbindError(data.error || '解绑失败');
        return;
      }

      // 解绑成功，更新局部视图
      if (unbindTarget.type === 'phone') {
        setCurrentPhone('');
        setCurrentProviders(currentProviders.filter((p) => p !== 'phone'));
      } else if (unbindTarget.type === 'email') {
        setCurrentEmail('');
        setCurrentProviders(currentProviders.filter((p) => p !== 'email'));
      } else if (unbindTarget.type === 'oauth') {
        setCurrentProviders(currentProviders.filter((p) => p !== unbindTarget.provider));
        setCurrentAccounts(currentAccounts.filter((a) => a.provider !== unbindTarget.provider));
      }

      setUnbindTarget(null);
      showToast(data.message || '解绑成功');
    } catch (err) {
      setUnbindError('网络连接异常');
    } finally {
      setUnbinding(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPwdMessage('');
    setPwdSuccess(false);

    if (newPassword.length < 8) {
      return setPwdMessage('新密码长度至少需要 8 位');
    }
    if (newPassword !== confirmPassword) {
      return setPwdMessage('两次输入的新密码不一致');
    }

    setPwdBusy(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwdSuccess(true);
        setPwdMessage('密码已成功修改并更新至数据库');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwdMessage(data.error || '修改密码失败');
      }
    } catch {
      setPwdMessage('网络请求失败，请稍后重试');
    } finally {
      setPwdBusy(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      const res = await fetch('/api/user/deactivate', { method: 'POST' });
      if (res.ok) {
        // 注销会吊销 Session 并清掉 ko_session，落地页必须是可用的登录入口；
        // 站点没有 /login 路由，/account 会跳转到工作室的账户面板。
        window.location.href = '/account';
      } else {
        showToast('注销申请提交失败，请联系客服');
      }
    } catch {
      showToast('网络连接异常');
    }
  };

  const textActionBtn = (label, onClick, isDanger = false) => (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      className={`h-7 px-3 text-xs font-medium rounded-full border transition-all cursor-pointer ${
        isDanger
          ? 'border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/40'
          : 'border-white/[0.08] hover:border-white/20 text-gray-200 hover:text-white'
      }`}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 顶部标题区 */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">个人资料与账号体系</h1>
        <p className="mt-1 text-xs text-gray-400">管理您的不可变 6 位数字身份 ID、基本资料及多登录凭据绑定。</p>
      </div>

      {/* 个人基本信息卡片 (包含不可更改 6 位数随机数字 ID，逻辑参考 QQ 号) */}
      <Card className="rounded-[18px] border border-white/[0.07] bg-[#1a1b1f] p-6 shadow-sm">
        <CardHeader className="p-0 pb-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-white">个人基本信息</CardTitle>
            <p className="mt-0.5 text-xs text-gray-400">您的数字 ID 为全局唯一不可变凭证，与 QQ 号逻辑一致。</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono">
            <Hash className="size-3.5" />
            <span>UID: {userNumber}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSaveProfile} className="flex max-w-xl flex-col gap-4">
            {/* 创作者个性化头像更换模块 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-[#121316]/70 border border-white/[0.06]">
              <div className="relative group shrink-0">
                {currentAvatarUrl ? (
                  <img
                    src={currentAvatarUrl}
                    alt="用户头像"
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/10 group-hover:brightness-90 transition-all"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 via-zinc-800 to-zinc-900 border border-cyan-400/30 flex items-center justify-center text-xl font-bold text-cyan-300 shadow-md">
                    {(profileName || user?.email || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                  title="点击更换头像"
                >
                  <Camera className="size-5 text-white" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <span>创作者头像</span>
                  {currentAvatarUrl && (
                    <span className="text-[10px] text-cyan-400 font-normal px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20">
                      已自定义
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  支持 JPG、PNG、WebP、GIF 格式，大小不超过 5MB，推荐 1:1 正方形图片。
                </p>
                <div className="flex items-center gap-2.5 mt-2.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={avatarUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 px-3 text-xs bg-white/10 hover:bg-white/15 text-white border border-white/15 rounded-full cursor-pointer flex items-center gap-1.5"
                  >
                    {avatarUploading ? (
                      <>
                        <Loader2 className="size-3 animate-spin text-cyan-400" />
                        <span>上传同步中…</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="size-3.5 text-cyan-400" />
                        <span>更换新头像</span>
                      </>
                    )}
                  </Button>
                  {currentAvatarUrl && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={handleRemoveAvatar}
                      className="text-[11px] text-zinc-400 hover:text-red-400 transition-colors cursor-pointer px-2 py-1"
                    >
                      恢复默认
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              <span className="flex items-center justify-between">
                <span>用户唯一数字 ID (不可修改)</span>
                <span className="text-[11px] text-zinc-500">终身绑定 · 支持直接登录</span>
              </span>
              <Input
                value={`#${userNumber}`}
                disabled
                className="bg-[#121316]/60 border-white/[0.05] text-zinc-400 font-mono cursor-not-allowed select-all"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              展示昵称
              <Input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={30}
                placeholder="请输入创作者昵称"
                className="bg-[#121316] border-white/[0.08] text-white focus:border-white/30"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              个人简介
              <Textarea
                rows={4}
                value={profileBio}
                onChange={(event) => setProfileBio(event.target.value)}
                maxLength={150}
                placeholder="介绍你的创作专长和风格（例如：科幻场景、写实人像、运镜微距…）"
                className="bg-[#121316] border-white/[0.08] text-white focus:border-white/30 resize-none"
              />
            </label>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-500">最多 150 字</span>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={busy}
                className="bg-white text-black hover:bg-gray-200 font-semibold px-5 rounded-full h-8 text-xs"
              >
                {busy ? '正在保存…' : '保存资料修改'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 账号权限与多渠道绑定/解绑卡片 (满足要求：可解绑手机号、邮箱、社交登录) */}
      <Card className="rounded-[18px] border border-white/[0.07] bg-[#1a1b1f] p-6 shadow-sm">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-semibold text-white">登录凭证与第三方绑定</CardTitle>
          <p className="mt-0.5 text-xs text-gray-400">
            支持绑定或解绑任意登录渠道；系统内置防孤儿账号保护，保障随时可登录。
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-white/[0.06]">
            {/* 手机号 */}
            <SettingRow
              icon={<PhoneIcon className="size-4 text-emerald-400" />}
              title="手机号绑定"
              description={currentPhone ? `${user?.phoneCountryCode || '+86'} ${currentPhone}` : '未绑定手机号'}
              action={
                currentPhone ? (
                  <>
                    {textActionBtn('换绑', () => {
                      setInputPhone(currentPhone);
                      setPhoneNotice('');
                      setPhoneModalOpen(true);
                    })}
                    {textActionBtn('解绑', () => {
                      setUnbindError('');
                      setUnbindTarget({ type: 'phone', label: `手机号 (${currentPhone})` });
                    }, true)}
                  </>
                ) : (
                  textActionBtn('立即绑定', () => {
                    setInputPhone('');
                    setPhoneNotice('');
                    setPhoneModalOpen(true);
                  })
                )
              }
            />

            {/* 安全邮箱 */}
            <SettingRow
              icon={<MailIcon className="size-4 text-blue-400" />}
              title="安全邮箱"
              description={currentEmail || '未设置安全邮箱'}
              action={
                currentEmail ? (
                  <>
                    {textActionBtn('换绑', () => {
                      setInputEmail(currentEmail);
                      setEmailNotice('');
                      setEmailModalOpen(true);
                    })}
                    {textActionBtn('解绑', () => {
                      setUnbindError('');
                      setUnbindTarget({ type: 'email', label: `安全邮箱 (${currentEmail})` });
                    }, true)}
                  </>
                ) : (
                  textActionBtn('绑定邮箱', () => {
                    setInputEmail('');
                    setEmailNotice('');
                    setEmailModalOpen(true);
                  })
                )
              }
            />

            {/* 微信 */}
            {(() => {
              const wechatAcc = currentAccounts.find((a) => a.provider === 'wechat');
              const isBound = currentProviders.includes('wechat');
              const accountText = wechatAcc?.providerUsername || wechatAcc?.providerUserId;
              return (
                <SettingRow
                  icon={<WeChatIcon className="size-4.5" />}
                  title="微信账号"
                  description={
                    isBound
                      ? (accountText ? `已关联账号: ${accountText}` : '已关联微信快捷登录')
                      : '微信扫码快捷登录与公众号提醒'
                  }
                  action={
                    isBound ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          已关联
                        </span>
                        {textActionBtn('解绑', () => {
                          setUnbindError('');
                          setUnbindTarget({ type: 'oauth', provider: 'wechat', label: '微信' });
                        }, true)}
                      </>
                    ) : (
                      textActionBtn('关联微信', () => {
                        setWechatModalOpen(true);
                      })
                    )
                  }
                />
              );
            })()}

            {/* Google */}
            {(() => {
              const googleAcc = currentAccounts.find((a) => a.provider === 'google');
              const isBound = currentProviders.includes('google');
              const accountText = googleAcc?.providerEmail || googleAcc?.providerUsername || (isBound ? currentEmail : null);
              return (
                <SettingRow
                  icon={<GoogleIcon className="size-4" />}
                  title="Google 账号"
                  description={
                    isBound
                      ? (accountText ? `已绑定账号: ${accountText}` : '已授权 Google 全球化快捷登录')
                      : 'Google One Tap 全球化快捷登录'
                  }
                  action={
                    isBound ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.06] text-gray-300">
                          已授权
                        </span>
                        {textActionBtn('换绑', () => handleConnectOAuth('google'))}
                        {textActionBtn('解绑', () => {
                          setUnbindError('');
                          setUnbindTarget({ type: 'oauth', provider: 'google', label: `Google (${accountText || '账号'})` });
                        }, true)}
                      </>
                    ) : (
                      textActionBtn('绑定 Google', () => handleConnectOAuth('google'))
                    )
                  }
                />
              );
            })()}

            {/* X / Twitter */}
            {(() => {
              const xAcc = currentAccounts.find((a) => a.provider === 'x');
              const isBound = currentProviders.includes('x');
              const accountText = xAcc?.providerUsername ? `@${xAcc.providerUsername}` : xAcc?.providerEmail;
              return (
                <SettingRow
                  icon={<XIcon className="size-3.5 text-white" />}
                  title="X (Twitter) 账号"
                  description={
                    isBound
                      ? (accountText ? `已授权账号: ${accountText}` : '已授权 X 快捷登录')
                      : 'X 社交账号快捷登录'
                  }
                  action={
                    isBound ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.06] text-gray-300">
                          已授权
                        </span>
                        {textActionBtn('换绑', () => handleConnectOAuth('x'))}
                        {textActionBtn('解绑', () => {
                          setUnbindError('');
                          setUnbindTarget({ type: 'oauth', provider: 'x', label: `X (${accountText || '账号'})` });
                        }, true)}
                      </>
                    ) : (
                      textActionBtn('绑定 X', () => handleConnectOAuth('x'))
                    )
                  }
                />
              );
            })()}

            {/* TikTok */}
            {(() => {
              const tiktokAcc = currentAccounts.find((a) => a.provider === 'tiktok');
              const isBound = currentProviders.includes('tiktok');
              const accountText = tiktokAcc?.providerUsername || tiktokAcc?.providerUserId;
              return (
                <SettingRow
                  icon={<TikTokIcon className="size-3.5 text-pink-400" />}
                  title="TikTok 账号"
                  description={
                    isBound
                      ? (accountText ? `已授权账号: ${accountText}` : '已授权 TikTok 快捷登录')
                      : 'TikTok 移动端与短视频快捷登录'
                  }
                  action={
                    isBound ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.06] text-gray-300">
                          已授权
                        </span>
                        {textActionBtn('换绑', () => handleConnectOAuth('tiktok'))}
                        {textActionBtn('解绑', () => {
                          setUnbindError('');
                          setUnbindTarget({ type: 'oauth', provider: 'tiktok', label: `TikTok (${accountText || '账号'})` });
                        }, true)}
                      </>
                    ) : (
                      textActionBtn('绑定 TikTok', () => handleConnectOAuth('tiktok'))
                    )
                  }
                />
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* 账户安全卡片 */}
      <Card className="rounded-[18px] border border-white/[0.07] bg-[#1a1b1f] p-6 shadow-sm">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-semibold text-white">独立登录密码</CardTitle>
          <p className="mt-0.5 text-xs text-gray-400">
            设置密码后，可使用您的 6 位数字 ID ({userNumber}) 直接输入密码登录系统。
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handlePasswordChange} className="flex max-w-sm flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              当前密码 (初次设置可留空)
              <Input
                type="password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                placeholder="请输入当前登录密码"
                className="bg-[#121316] border-white/[0.08] text-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              新密码
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 8 位包含字母和数字"
                className="bg-[#121316] border-white/[0.08] text-white"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-300">
              确认新密码
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                className="bg-[#121316] border-white/[0.08] text-white"
              />
            </label>
            {pwdMessage && (
              <p className={`text-xs mt-1 ${pwdSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
                {pwdMessage}
              </p>
            )}
            <Button
              type="submit"
              variant="outline"
              size="md"
              disabled={pwdBusy}
              className="mt-2 h-8 px-4 text-xs font-medium rounded-full border-white/10 bg-white/[0.04] text-gray-200 hover:bg-white/[0.08] hover:text-white w-fit cursor-pointer"
            >
              {pwdBusy ? '正在更新…' : '设置/更新登录密码'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 注销账户警告 */}
      <div className="rounded-[18px] border border-red-500/20 bg-red-500/[0.04] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-400">注销账户</p>
            <p className="mt-0.5 text-xs text-gray-400">
              注销后作品库、剩余 K 币与积分资产将被永久清除且不可恢复。
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="h-8 px-4 text-xs font-semibold rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 shrink-0 cursor-pointer"
              >
                注销账户
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-white/[0.10] bg-[#13151c] text-white">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">确认注销账户？</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  这是不可逆操作。提交后当前会话将立即注销，账户进入冻结保护期。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-white/[0.10] bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]">
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 cursor-pointer"
                  onClick={handleDeactivate}
                >
                  确认注销
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* 手机绑定弹窗 */}
      {phoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16171b] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">绑定/更换手机号</h3>
            <p className="text-xs text-gray-400 mt-1 mb-4">输入手机号码及收到的短信验证码</p>
            <form onSubmit={handleBindPhone} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  value={inputPhone}
                  onChange={(e) => setInputPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="bg-[#101114] border-white/10 text-white flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={phoneBusy}
                  onClick={handleSendPhoneCode}
                  className="h-9 px-3 text-xs border-white/10 bg-white/[0.04] text-gray-200 shrink-0 cursor-pointer"
                >
                  {phoneBusy ? '发送中' : '获取验证码'}
                </Button>
              </div>
              <Input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="请输入短信验证码"
                className="bg-[#101114] border-white/10 text-white"
              />
              {phoneNotice && (
                <p className="text-xs text-cyan-400">{phoneNotice}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhoneModalOpen(false)}
                  className="text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={phoneBusy}
                  className="bg-white text-black font-semibold text-xs px-4 rounded-full cursor-pointer"
                >
                  确认绑定
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 邮箱绑定弹窗 */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16171b] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">绑定/换绑安全邮箱</h3>
            <p className="text-xs text-gray-400 mt-1 mb-4">输入您的常用工作或个人邮箱地址</p>
            <form onSubmit={handleBindEmail} className="flex flex-col gap-3">
              <Input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="name@example.com"
                className="bg-[#101114] border-white/10 text-white"
              />
              {emailNotice && (
                <p className="text-xs text-cyan-400">{emailNotice}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEmailModalOpen(false)}
                  className="text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={emailBusy}
                  className="bg-white text-black font-semibold text-xs px-4 rounded-full cursor-pointer"
                >
                  确认保存
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 解绑确认模态弹窗 */}
      {unbindTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16171b] p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 mb-2">
              <AlertTriangle className="size-5" />
              <h3 className="text-base font-semibold text-white">确认解绑 {unbindTarget.label}？</h3>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              解绑后，您将无法再使用该渠道快捷登录。您的 6 位数字身份 ID (#{userNumber})、创作资产与积分将不受影响。
            </p>

            {unbindError && (
              <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs leading-relaxed">
                {unbindError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={unbinding}
                onClick={() => setUnbindTarget(null)}
                className="text-gray-400 hover:text-white text-xs cursor-pointer"
              >
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={unbinding}
                onClick={confirmExecuteUnbind}
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-semibold text-xs px-4 rounded-full cursor-pointer"
              >
                {unbinding ? '正在解绑…' : '确认解绑'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 微信绑定提示弹窗 */}
      {wechatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16171b] p-6 shadow-2xl text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 mb-4">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="text-base font-semibold text-white">微信扫码关联</h3>
            <p className="mt-2 text-xs text-gray-300 leading-relaxed text-left">
              微信公众号与扫码快捷登录通道正在进行开放平台服务对齐。您当前可以通过已绑定的手机号验证码进行安全登录与消费，若需微信通知提醒，可关注官方公众号。
            </p>
            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => setWechatModalOpen(false)}
                className="bg-white text-black hover:bg-gray-200 text-xs px-5 rounded-full cursor-pointer"
              >
                我知道了
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 浮动 Toast 提示 */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full border border-white/15 bg-[#1f2128]/95 px-5 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2"
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
