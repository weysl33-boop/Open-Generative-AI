'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Hash, AlertTriangle, Camera, UploadCloud, Loader2, Globe2, UserRound } from 'lucide-react';
import { COUNTRY_CODES, GENDER_OPTIONS } from '@/lib/onboarding/schema';
import { DouyinIcon, GoogleIcon, QQIcon, TikTokIcon, WeChatIcon, XIcon, PhoneIcon, MailIcon } from '@/components/SocialIcons';
import { completePhoneCaptchaChallenge } from '@/lib/auth/phone-captcha-client';

const SOCIAL_ACCOUNT_PROVIDERS = {
  wechat: { title: '微信账号', shortName: '微信', icon: WeChatIcon, description: '微信快捷登录' },
  qq: { title: 'QQ 账号', shortName: 'QQ', icon: QQIcon, description: 'QQ 快捷登录' },
  douyin: { title: '抖音账号', shortName: '抖音', icon: DouyinIcon, description: '抖音快捷登录' },
  google: { title: 'Google 账号', shortName: 'Google', icon: GoogleIcon, description: 'Google 全球化快捷登录' },
  x: { title: 'X 账号', shortName: 'X', icon: XIcon, description: 'X 社交账号快捷登录' },
  tiktok: { title: 'TikTok 账号', shortName: 'TikTok', icon: TikTokIcon, description: 'TikTok 全球化快捷登录' },
};
const SOCIAL_ACCOUNT_PROVIDER_ORDER = ['wechat', 'qq', 'douyin', 'google', 'x', 'tiktok'];
const PHONE_DIAL_CODES = ['+86', '+1', '+44', '+49', '+61', '+65', '+81', '+82', '+852', '+853', '+886'];

function SettingRow({ icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-subtle py-3.5 last:border-0 min-h-16">
      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
        {icon && (
          <div className="size-9 rounded-xl bg-wash border border-line-subtle flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{title}</p>
          <p className="mt-0.5 text-xs text-ink-muted truncate">{description}</p>
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
  profileCountry,
  setProfileCountry,
  profileGender,
  setProfileGender,
  onSaveProfile,
  onProfileUpdated,
  busy,
}) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(user?.avatar || user?.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(null);
  const fileInputRef = useRef(null);

  // 国家名按当前语言渲染，省掉 43 个国家 × 6 份文案目录
  const countryNames = useMemo(() => {
    try {
      const display = new Intl.DisplayNames([user?.locale || 'zh-CN'], { type: 'region', fallback: 'code' });
      return Object.fromEntries(COUNTRY_CODES.map((code) => [code, display.of(code) || code]));
    } catch {
      return Object.fromEntries(COUNTRY_CODES.map((code) => [code, code]));
    }
  }, [user?.locale]);

  const [currentProviders, setCurrentProviders] = useState(user?.loginProviders || ['phone']);
  const [currentAccounts, setCurrentAccounts] = useState(user?.authAccounts || []);
  const [socialOptions, setSocialOptions] = useState(null);
  const [socialOptionsError, setSocialOptionsError] = useState(false);
  const [socialOptionsRetry, setSocialOptionsRetry] = useState(0);
  const [currentPhone, setCurrentPhone] = useState(user?.phone || '');
  const [currentEmail, setCurrentEmail] = useState(user?.email || '');

  useEffect(() => {
    setCurrentAvatarUrl(user?.avatar || user?.avatar_url || null);
    if (user?.loginProviders) setCurrentProviders(user?.loginProviders);
    if (user?.authAccounts) setCurrentAccounts(user?.authAccounts);
    if (user?.phone) setCurrentPhone(user?.phone);
    if (user?.email) setCurrentEmail(user?.email);
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    setSocialOptions(null);
    setSocialOptionsError(false);
    fetch('/api/auth/social-options', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load regional social providers');
        const result = await response.json();
        if (!Array.isArray(result.providers)) throw new Error('Invalid social provider response');
        setSocialOptions(result);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setSocialOptionsError(true);
      });
    return () => controller.abort();
  }, [socialOptionsRetry]);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  // 手机号与邮箱绑定弹窗状态
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [inputPhone, setInputPhone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+86');
  const [inputCode, setInputCode] = useState('');
  const [phoneChallengeId, setPhoneChallengeId] = useState('');
  const [phoneCaptchaChallenge, setPhoneCaptchaChallenge] = useState(null);
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const phoneTimerRef = useRef(null);
  const phoneCaptchaHostRef = useRef(null);
  const [phoneNotice, setPhoneNotice] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // Toast 状态
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(''), 3000);
  }, []);

  useEffect(() => () => {
    if (phoneTimerRef.current) clearInterval(phoneTimerRef.current);
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
  const visibleSocialProviderIds = [...new Set([
    ...(socialOptions?.providers || []).map((provider) => provider.id),
    ...currentProviders,
    ...currentAccounts.map((account) => account.provider),
  ])]
    .filter((provider) => SOCIAL_ACCOUNT_PROVIDERS[provider])
    .sort((a, b) => SOCIAL_ACCOUNT_PROVIDER_ORDER.indexOf(a) - SOCIAL_ACCOUNT_PROVIDER_ORDER.indexOf(b));

  const handleSendPhoneCode = async () => {
    if (!inputPhone) return setPhoneNotice('请输入手机号');
    if (phoneCountdown > 0) return;
    setPhoneBusy(true);
    setPhoneNotice('');
    try {
      const postSendCode = async (extra = {}) => {
        const response = await fetch('/api/auth/phone/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: inputPhone, countryCode: phoneCountryCode, purpose: 'bind', ...extra }),
        });
        return { response, data: await response.json() };
      };
      let outcome;
      if (phoneCaptchaChallenge) {
        outcome = await completePhoneCaptchaChallenge(phoneCaptchaChallenge, {
          postSendCode,
          locale: user?.locale || 'zh-CN',
          container: phoneCaptchaHostRef.current,
        });
      } else {
        outcome = await postSendCode();
        if (outcome.response.status === 428 && outcome.data.requiresCaptcha) {
          setPhoneChallengeId(outcome.data.challengeId);
          setPhoneCaptchaChallenge(outcome.data);
          outcome = await completePhoneCaptchaChallenge(outcome.data, {
            postSendCode,
            locale: user?.locale || 'zh-CN',
            container: phoneCaptchaHostRef.current,
          });
        }
      }
      if (!outcome.response.ok || !outcome.data.success) {
        if (outcome.response.status !== 428) {
          setPhoneCaptchaChallenge(null);
          setPhoneChallengeId('');
        }
        throw new Error(outcome.data.error || '验证码发送失败');
      }
      setPhoneChallengeId(outcome.data.challengeId);
      setPhoneCaptchaChallenge(null);
      setPhoneCountdown(Number(outcome.data.cooldown) || 60);
      if (phoneTimerRef.current) clearInterval(phoneTimerRef.current);
      phoneTimerRef.current = setInterval(() => {
        setPhoneCountdown((previous) => {
          if (previous <= 1) {
            clearInterval(phoneTimerRef.current);
            return 0;
          }
          return previous - 1;
        });
      }, 1000);
      setPhoneNotice('验证码已发送');
    } catch {
      setPhoneNotice('安全验证或验证码发送失败，请稍后重试');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleBindPhone = async (e) => {
    e.preventDefault();
    if (!inputPhone || !inputCode) return setPhoneNotice('请完整输入手机号与验证码');
    if (!phoneChallengeId) return setPhoneNotice('请先获取验证码');
    setPhoneBusy(true);
    try {
      const res = await fetch('/api/user/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: inputPhone, countryCode: phoneCountryCode, code: inputCode, challengeId: phoneChallengeId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('手机号绑定成功');
        setCurrentPhone(data.phone || inputPhone);
        if (!currentProviders.includes('phone')) {
          setCurrentProviders([...currentProviders, 'phone']);
        }
        setPhoneModalOpen(false);
        setPhoneChallengeId('');
        setPhoneCaptchaChallenge(null);
        setPhoneCountdown(0);
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
    if (emailVerificationPending && !/^\d{6}$/.test(emailVerificationCode)) {
      return setEmailNotice('请输入邮件中的 6 位验证码');
    }
    setEmailBusy(true);
    try {
      const res = await fetch('/api/user/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inputEmail,
          ...(emailVerificationPending ? { code: emailVerificationCode } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.verificationRequired) {
          setEmailVerificationPending(true);
          setEmailNotice('验证码已发送，10 分钟内有效，请查收邮件后确认');
          return;
        }
        showToast('安全邮箱绑定成功');
        setCurrentEmail(data.email || inputEmail);
        if (!currentProviders.includes('email')) {
          setCurrentProviders([...currentProviders, 'email']);
        }
        setEmailModalOpen(false);
        setEmailVerificationPending(false);
        setEmailVerificationCode('');
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
      size="xs"
      variant={isDanger ? 'danger' : 'secondary'}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 顶部标题区 */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">个人资料与账号体系</h1>
        <p className="mt-1 text-xs text-ink-muted">管理您的不可变 6 位数字身份 ID、基本资料及多登录凭据绑定。</p>
      </div>

      {/* 个人基本信息卡片 (包含不可更改 6 位数随机数字 ID，逻辑参考 QQ 号) */}
      <Card padding="lg">
        <CardHeader className="p-0 pb-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-ink">个人基本信息</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">您的数字 ID 为全局唯一不可变凭证，与 QQ 号逻辑一致。</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-success-line bg-success-soft text-success text-xs font-mono">
            <Hash className="size-3.5" />
            <span>UID: {userNumber}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSaveProfile} className="flex max-w-xl flex-col gap-4">
            {/* 创作者个性化头像更换模块 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-well border border-line-subtle">
              <div className="relative group shrink-0">
                {currentAvatarUrl ? (
                  <img
                    src={currentAvatarUrl}
                    alt="用户头像"
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-brand-ring shadow-elevation-2 group-hover:brightness-90 transition-[filter] duration-fast ease-standard"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-raised border border-line-accent flex items-center justify-center text-xl font-bold text-brand shadow-elevation-1">
                    {(profileName || user?.email || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 flex items-center justify-center bg-scrim rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                  title="点击更换头像"
                >
                  <Camera className="size-5 text-ink" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <span>创作者头像</span>
                  {currentAvatarUrl && (
                    <span className="text-caption text-brand font-normal px-1.5 py-0.5 rounded bg-brand-soft border border-line-accent">
                      已自定义
                    </span>
                  )}
                </p>
                <p className="text-caption text-ink-muted mt-0.5">
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
                    className="flex items-center gap-1.5"
                  >
                    {avatarUploading ? (
                      <>
                        <Loader2 className="size-3 animate-spin text-brand" />
                        <span>上传同步中…</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="size-3.5 text-brand" />
                        <span>更换新头像</span>
                      </>
                    )}
                  </Button>
                  {currentAvatarUrl && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={handleRemoveAvatar}
                      className="text-caption text-ink-muted hover:text-danger transition-colors cursor-pointer px-2 py-1"
                    >
                      恢复默认
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              <span className="flex items-center justify-between">
                <span>用户唯一数字 ID (不可修改)</span>
                <span className="text-caption text-ink-subtle">终身绑定 · 支持直接登录</span>
              </span>
              <Input
                value={`#${userNumber}`}
                disabled
                className="font-mono select-all"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              展示昵称
              <Input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={30}
                placeholder="请输入创作者昵称"
              />
            </label>

            {/* 引导页只收昵称与头像，国家与性别留到这里补全。
                下拉里没有空值项，所以选定之后只能改选别的，回不到未填状态。 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe2 className="size-3.5 text-ink-muted" />
                    国家或地区
                  </span>
                  {!profileCountry && <span className="text-caption text-warning">待补全</span>}
                </span>
                <Select value={profileCountry || ''} onValueChange={setProfileCountry}>
                  <SelectTrigger size="md" aria-label="国家或地区">
                    <SelectValue placeholder="请选择国家或地区" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((code) => (
                      <SelectItem key={code} value={code}>{countryNames[code]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-caption text-ink-subtle">用于内容合规与本地化，选定后不可清空。</span>
              </div>

              <div className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserRound className="size-3.5 text-ink-muted" />
                    性别
                  </span>
                  {!profileGender && <span className="text-caption text-warning">待补全</span>}
                </span>
                <Select value={profileGender || ''} onValueChange={setProfileGender}>
                  <SelectTrigger size="md" aria-label="性别">
                    <SelectValue placeholder="请选择性别" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-caption text-ink-subtle">仅用于偏好推荐，可随时改选，选定后不可清空。</span>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              个人简介
              <Textarea
                rows={4}
                value={profileBio}
                onChange={(event) => setProfileBio(event.target.value)}
                maxLength={150}
                placeholder="介绍你的创作专长和风格（例如：科幻场景、写实人像、运镜微距…）"
                className="resize-none"
              />
            </label>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-ink-subtle">最多 150 字</span>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={busy}
              >
                {busy ? '正在保存…' : '保存资料修改'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 账号权限与多渠道绑定/解绑卡片 (满足要求：可解绑手机号、邮箱、社交登录) */}
      <Card padding="lg">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-semibold text-ink">登录凭证与第三方绑定</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            支持绑定或解绑任意登录渠道；系统内置防孤儿账号保护，保障随时可登录。
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line-subtle">
            {/* 手机号 */}
            <SettingRow
              icon={<PhoneIcon className="size-4 text-success" />}
              title="手机号绑定"
                  description={currentPhone ? (currentPhone.startsWith('+') ? currentPhone : `${user?.phoneCountryCode || '+86'} ${currentPhone}`) : '未绑定手机号'}
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
              icon={<MailIcon className="size-4 text-info" />}
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

            {!socialOptions && (
              <div className="flex items-center justify-between gap-3 py-2 text-xs text-ink-muted" role={socialOptionsError ? 'alert' : 'status'}>
                <span>{socialOptionsError ? '无法识别当前网络地区；已绑定账号仍可管理。' : '正在根据当前网络地区加载社交绑定方式…'}</span>
                {socialOptionsError && (
                  <button
                    type="button"
                    className="shrink-0 text-info underline underline-offset-2"
                    onClick={() => setSocialOptionsRetry((value) => value + 1)}
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            {visibleSocialProviderIds.map((provider) => {
              const spec = SOCIAL_ACCOUNT_PROVIDERS[provider];
              const ProviderIcon = spec.icon;
              const providerOptions = socialOptions?.providers?.find((item) => item.id === provider);
              const isAvailable = providerOptions?.available === true;
              const isBound = currentProviders.includes(provider);
              const account = currentAccounts.find((item) => item.provider === provider);
              const accountText = provider === 'google'
                ? (account?.providerEmail || account?.providerUsername || (isBound ? currentEmail : null))
                : provider === 'x'
                  ? (account?.providerUsername ? `@${account.providerUsername}` : account?.providerEmail)
                  : (account?.providerUsername || account?.providerUserId);
              const description = isBound
                ? (accountText ? `已绑定账号: ${accountText}` : `已绑定${spec.shortName}快捷登录`)
                : isAvailable
                  ? spec.description
                  : providerOptions
                    ? `${spec.shortName}登录尚未接入，暂不可绑定`
                    : '此方式不属于当前 IP 地区的登录选项';

              return (
                <SettingRow
                  key={provider}
                  icon={<ProviderIcon className="size-4 text-ink" />}
                  title={spec.title}
                  description={description}
                  action={isBound ? (
                    <>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-line bg-wash-strong text-xs font-medium text-ink">
                        已绑定
                      </span>
                      {isAvailable && textActionBtn('换绑', () => handleConnectOAuth(provider))}
                      {textActionBtn('解绑', () => {
                        setUnbindError('');
                        setUnbindTarget({ type: 'oauth', provider, label: `${spec.shortName} (${accountText || '账号'})` });
                      }, true)}
                    </>
                  ) : isAvailable ? (
                    textActionBtn(`绑定 ${spec.shortName}`, () => handleConnectOAuth(provider))
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-line-subtle bg-wash px-2.5 py-1 text-xs text-ink-muted">
                      {providerOptions ? '接入准备中' : socialOptions ? '当前地区不可用' : '暂不可用'}
                    </span>
                  )}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 账户安全卡片 */}
      <Card padding="lg">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-semibold text-ink">独立登录密码</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            设置密码后，可使用您的 6 位数字 ID ({userNumber}) 直接输入密码登录系统。
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handlePasswordChange} className="flex max-w-sm flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              当前密码 (初次设置可留空)
              <Input
                type="password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                placeholder="请输入当前登录密码"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              新密码
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 8 位包含字母和数字"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
              确认新密码
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
              />
            </label>
            {pwdMessage && (
              <p className={`text-xs mt-1 ${pwdSuccess ? 'text-success' : 'text-danger'}`}>
                {pwdMessage}
              </p>
            )}
            <Button
              type="submit"
              variant="outline"
              size="md"
              disabled={pwdBusy}
              className="mt-2 w-fit"
            >
              {pwdBusy ? '正在更新…' : '设置/更新登录密码'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 注销账户警告 */}
      <div className="rounded-xl border border-danger-line bg-danger-soft p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">注销账户</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              注销后作品库、剩余硬币与积分资产将被永久清除且不可恢复。
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="shrink-0"
              >
                注销账户
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认注销账户？</AlertDialogTitle>
                <AlertDialogDescription>
                  这是不可逆操作。提交后当前会话将立即注销，账户进入冻结保护期。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
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
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-elevation-4">
            <h3 className="text-base font-semibold text-ink">绑定/更换手机号</h3>
            <p className="text-xs text-ink-muted mt-1 mb-4">输入手机号码及收到的短信验证码</p>
            <form onSubmit={handleBindPhone} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Select value={phoneCountryCode} onValueChange={(value) => {
                  setPhoneCountryCode(value);
                  setPhoneChallengeId('');
                  setPhoneCaptchaChallenge(null);
                  setPhoneCountdown(0);
                  if (phoneTimerRef.current) clearInterval(phoneTimerRef.current);
                }}>
                  <SelectTrigger className="w-24 shrink-0" aria-label="国家区号">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHONE_DIAL_CODES.map((dialCode) => (
                      <SelectItem key={dialCode} value={dialCode}>{dialCode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={inputPhone}
                  onChange={(e) => {
                    setInputPhone(e.target.value);
                    setPhoneChallengeId('');
                    setPhoneCaptchaChallenge(null);
                    setPhoneCountdown(0);
                    if (phoneTimerRef.current) clearInterval(phoneTimerRef.current);
                  }}
                  placeholder="请输入手机号"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={phoneBusy || phoneCountdown > 0}
                  onClick={handleSendPhoneCode}
                  className="shrink-0"
                >
                  {phoneBusy ? '发送中' : phoneCountdown > 0 ? `${phoneCountdown}s 后重发` : '获取验证码'}
                </Button>
              </div>
              <div ref={phoneCaptchaHostRef} aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" />
              <Input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="请输入短信验证码"
              />
              {phoneNotice && (
                <p className="text-xs text-brand">{phoneNotice}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhoneModalOpen(false)}
                  className="text-ink-muted hover:text-ink text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={phoneBusy || !phoneChallengeId}
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
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-elevation-4">
            <h3 className="text-base font-semibold text-ink">绑定/换绑安全邮箱</h3>
            <p className="text-xs text-ink-muted mt-1 mb-4">输入您的常用工作或个人邮箱地址</p>
            <form onSubmit={handleBindEmail} className="flex flex-col gap-3">
              <Input
                type="email"
                value={inputEmail}
                onChange={(e) => {
                  setInputEmail(e.target.value);
                  setEmailVerificationPending(false);
                  setEmailVerificationCode('');
                }}
                placeholder="name@example.com"
                disabled={emailVerificationPending}
              />
              {emailVerificationPending && (
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={emailVerificationCode}
                  onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位邮箱验证码"
                />
              )}
              {emailNotice && (
                <p className="text-xs text-brand">{emailNotice}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEmailModalOpen(false);
                    setEmailVerificationPending(false);
                    setEmailVerificationCode('');
                  }}
                  className="text-ink-muted hover:text-ink text-xs cursor-pointer"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={emailBusy}
                >
                  {emailVerificationPending ? '确认绑定' : '发送验证码'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 解绑确认模态弹窗 */}
      {unbindTarget && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-elevation-4">
            <div className="flex items-center gap-2.5 text-warning mb-2">
              <AlertTriangle className="size-5" />
              <h3 className="text-base font-semibold text-ink">确认解绑 {unbindTarget.label}？</h3>
            </div>
            <p className="text-xs text-ink leading-relaxed mb-4">
              解绑后，您将无法再使用该渠道快捷登录。您的 6 位数字身份 ID (#{userNumber})、创作资产与积分将不受影响。
            </p>

            {unbindError && (
              <div className="mb-4 p-3 rounded-xl border border-danger-line bg-danger-soft text-danger text-xs leading-relaxed">
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
                className="text-ink-muted hover:text-ink text-xs cursor-pointer"
              >
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={unbinding}
                onClick={confirmExecuteUnbind}
              >
                {unbinding ? '正在解绑…' : '确认解绑'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 浮动 Toast 提示 */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-toast flex items-center gap-2 rounded-full border border-line-strong bg-overlay-glass px-5 py-2 text-xs font-medium text-ink shadow-elevation-4 backdrop-blur-md animate-in fade-in slide-in-from-top-2"
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
