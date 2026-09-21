'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Layers, X } from 'lucide-react';
import { DouyinIcon, GoogleIcon, QQIcon, TikTokIcon, WeChatIcon, XIcon } from './SocialIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconButton } from 'studio/ui/button';
import { Label } from 'studio/ui/field';
import { Alert } from 'studio/ui/feedback';
import { SegmentedControl } from 'studio/ui/navigation';
import {
  DIALOG_CLOSE_BUTTON,
  DIALOG_DESCRIPTION,
  DIALOG_TITLE,
} from 'studio/ui/tokens';
import { cn } from '@/lib/utils';
import { completePhoneCaptchaChallenge } from '@/lib/auth/phone-captcha-client';
import {
  DEFAULT_LOCALE,
  getCommonCopy,
  getLocaleFromPathname,
  isSupportedLocale,
  normalizeLocale,
} from '@/lib/locales';

const COUNTRY_CODES = ['+86', '+1', '+44', '+49', '+61', '+65', '+81', '+82', '+852', '+853', '+886'];

const PROVIDER_CATALOG = {
  wechat: { icon: WeChatIcon, labelKey: 'providerWeChat' },
  qq: { icon: QQIcon, labelKey: 'providerQQ' },
  douyin: { icon: DouyinIcon, labelKey: 'providerDouyin' },
  google: { icon: GoogleIcon, labelKey: 'providerGoogle' },
  x: { icon: XIcon, labelKey: 'providerX' },
  tiktok: { icon: TikTokIcon, labelKey: 'providerTikTok' },
};

function phoneErrorCopy(copy, data, fallback) {
  const messages = {
    INVALID_PHONE: copy.errorInvalidPhone,
    UNSUPPORTED_COUNTRY: copy.errorUnsupportedCountry,
    OTP_RATE_LIMITED: copy.errorRateLimited,
    OTP_EXPIRED: copy.errorCodeExpired,
    OTP_INCORRECT: copy.errorCodeInvalid,
    OTP_ATTEMPTS_EXCEEDED: copy.errorCodeInvalid,
    OTP_MISSING: copy.errorCodeInvalid,
    CAPTCHA_INVALID: copy.errorSecurityChallengeFailed,
    CAPTCHA_NOT_CONFIGURED: copy.errorSecurityChallengeFailed,
    APP_VERIFICATION_REQUIRED: copy.errorSecurityChallengeFailed,
    PHONE_ALREADY_BOUND: copy.errorPhoneAlreadyBound,
    PHONE_BINDING_REQUIRED: copy.errorPhoneAlreadyBound,
    ACCOUNT_SUSPENDED: copy.errorAccountSuspended,
    SMS_PROVIDER_NOT_CONFIGURED: copy.errorSmsUnavailable,
    SMS_PROVIDER_DISABLED: copy.errorSmsUnavailable,
    SMS_PROVIDER_UNAVAILABLE: copy.errorSmsUnavailable,
    PROVIDER_UNAUTHORIZED: copy.errorSmsUnavailable,
    PROVIDER_QUOTA_EXCEEDED: copy.errorSmsUnavailable,
    PROVIDER_UNAVAILABLE: copy.errorSmsUnavailable,
    PROVIDER_SERVICE_ERROR: copy.errorSmsUnavailable,
  };
  return messages[data?.code] || fallback;
}

/**
 * 与 middleware.js 的判定顺序保持一致：语言路由前缀优先，其次 `?lang`/`?locale`，
 * 再次已存偏好，最后英语。顺序不同会让弹框文案与它所在的页面错位。
 */
function resolveLocale(locale) {
  if (locale) return normalizeLocale(locale);
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const fromPath = getLocaleFromPathname(window.location.pathname);
  if (fromPath !== DEFAULT_LOCALE) return fromPath;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('lang') || params.get('locale');
  if (fromQuery && isSupportedLocale(fromQuery)) return normalizeLocale(fromQuery);

  const match = document.cookie.match(/(?:^|;\s*)(?:NEXT_LOCALE|locale)=([^;]+)/);
  const fromCookie = match ? decodeURIComponent(match[1]) : null;
  if (fromCookie && isSupportedLocale(fromCookie)) return normalizeLocale(fromCookie);

  return DEFAULT_LOCALE;
}

export default function AuthModal({
  isOpen = true,
  onSuccess,
  onClose,
  isInline = false,
  locale = null,
}) {
  const copy = useMemo(() => getCommonCopy(resolveLocale(locale)).authModal, [locale]);

  const triggerSuccess = (user, entitlements) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('koyosim-auth-success', { detail: { user, entitlements } }));
    }
    onSuccess?.(user, entitlements);
  };

  // 未完成引导的新用户不进原页面，先去引导页；/studio 侧还有服务端守卫兜底。
  const goToOnboardingIfNeeded = (needsIt) => {
    if (!needsIt || typeof window === 'undefined') return false;
    window.location.href = '/onboarding';
    return true;
  };

  // tab: 'email' | 'phone'
  const [mode, setMode] = useState('email');

  // 手机号登录/注册状态
  const [countryCode, setCountryCode] = useState('+86');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [captchaChallenge, setCaptchaChallenge] = useState(null);
  const captchaHostRef = useRef(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  // 邮箱登录/注册状态
  const [emailMode, setEmailMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 通用交互状态
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);
  const [socialOptions, setSocialOptions] = useState(null);
  const [socialOptionsError, setSocialOptionsError] = useState(false);
  const [socialOptionsRetry, setSocialOptionsRetry] = useState(0);

  // IP 分区由服务端完成，语言/时区/用户资料都不会覆盖地理判定结果。
  useEffect(() => {
    if (!isOpen) return undefined;
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
  }, [isOpen, socialOptionsRetry]);

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
        setMessage(event.data.message || copy.errorSocialFailed);
        return;
      }
      fetch('/api/auth/me', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => {
          if (data.user) {
            if (!goToOnboardingIfNeeded(data.user.onboardingCompleted === false)) {
              triggerSuccess(data.user, data.entitlements);
            }
          } else {
            setMessage(copy.errorSessionSync);
          }
        })
        .catch(() => setMessage(copy.errorSessionSync));
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onSuccess, copy]);

  // 发送手机验证码
  const handleSendCode = async () => {
    if (countdown > 0 || busy) return;
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setMessage(copy.errorMissingPhone);
      return;
    }
    setMessage('');
    setBusy(true);

    try {
      const postSendCode = async (extra = {}) => {
        const response = await fetch('/api/auth/phone/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, countryCode, purpose: 'login', ...extra }),
        });
        return { response, data: await response.json() };
      };

      let outcome;
      if (captchaChallenge) {
        outcome = await completePhoneCaptchaChallenge(captchaChallenge, { postSendCode, locale: resolveLocale(locale), container: captchaHostRef.current });
      } else {
        outcome = await postSendCode();
        if (outcome.response.status === 428 && outcome.data.requiresCaptcha) {
          setChallengeId(outcome.data.challengeId);
          setCaptchaChallenge(outcome.data);
          outcome = await completePhoneCaptchaChallenge(outcome.data, { postSendCode, locale: resolveLocale(locale), container: captchaHostRef.current });
        }
      }

      if (!outcome.response.ok || !outcome.data.success) {
        if (outcome.response.status !== 428) {
          setCaptchaChallenge(null);
          setChallengeId('');
        }
        throw new Error(phoneErrorCopy(copy, outcome.data, copy.errorCodeSendFailed));
      }

      setChallengeId(outcome.data.challengeId);
      setCaptchaChallenge(null);
      setCountdown(Number(outcome.data.cooldown) || 60);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      setMessage(err.message === 'SECURITY_CHALLENGE_FAILED'
        ? copy.errorSecurityChallengeFailed
        : err.message || copy.errorCodeSendFailed);
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
      if (mode === 'phone') {
        const cleanPhone = phone.trim();
        const cleanCode = code.trim();
        if (!cleanPhone) throw new Error(copy.errorMissingPhone);
        if (!cleanCode) throw new Error(copy.errorMissingCode);
        if (!challengeId) throw new Error(copy.errorCodeSendFailed);

        const res = await fetch('/api/auth/phone/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, countryCode, code: cleanCode, challengeId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(phoneErrorCopy(copy, data, copy.errorCodeInvalid));

        if (!goToOnboardingIfNeeded(data.requiresOnboarding)) triggerSuccess(data.user, null);
      } else {
        // 邮箱处理
        const cleanEmail = email.trim();
        if (!cleanEmail) throw new Error(copy.errorMissingEmail);
        if (!password || password.length < 8) throw new Error(copy.errorPasswordTooShort);

        const endpoint = emailMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          // 上游固定回中文，这里按字面量匹配后换成当前语言的提示。
          if (emailMode === 'login' && data.error?.includes('邮箱或密码不正确')) {
            throw new Error(copy.errorLoginHint);
          }
          throw new Error(data.error || copy.errorAuthFailed);
        }

        if (!goToOnboardingIfNeeded(data.requiresOnboarding)) triggerSuccess(data.user, null);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 第三方登录唤起（直接全页导航，彻底杜绝浏览器弹窗拦截）
  const handleSocialLogin = (provider) => {
    if (socialLoading || busy) return;
    setMessage('');
    setSocialLoading(provider);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (isInline) {
      window.location.href = '/studio';
    }
  };

  const visibleSocialProviders = (socialOptions?.providers || [])
    .map((provider) => ({ ...provider, ...PROVIDER_CATALOG[provider.id] }))
    .filter((provider) => provider.icon);

  const title =
    mode === 'phone' ? copy.titlePhone : emailMode === 'register' ? copy.titleRegister : copy.titleLogin;

  const submitLabel = busy
    ? copy.processing
    : mode === 'phone'
      ? copy.submitPhone
      : emailMode === 'register'
        ? copy.submitRegister
        : copy.submitLogin;

  // Radix 用 Title/Description 供给 dialog 的可访问名称，也会给它们注入自己的
  // id；内联变体不是 dialog，就把同样的文案渲染成裸标题。
  const Heading = isInline ? 'h2' : DialogTitle;
  const Description = isInline ? 'p' : DialogDescription;
  const headingClass = isInline ? DIALOG_TITLE : undefined;
  const descriptionClass = isInline ? DIALOG_DESCRIPTION : undefined;

  const panel = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg bg-brand text-ink-on-accent shadow-elevation-2">
          <Layers className="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <Heading className={headingClass}>{title}</Heading>
          <Description className={descriptionClass}>{copy.subtitle}</Description>
        </div>
      </div>

      <SegmentedControl
        ariaLabel={copy.modeLabel}
        value={mode}
        onValueChange={(next) => {
          setMode(next);
          setMessage('');
        }}
        options={[
          { value: 'email', label: copy.tabEmail },
          { value: 'phone', label: copy.tabPhone },
        ]}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === 'phone' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="auth-phone" required>
                {copy.phoneLabel}
              </Label>
              <div className="flex items-start gap-2">
                <div className="w-24 shrink-0">
                  <Select value={countryCode} onValueChange={(value) => {
                    setCountryCode(value);
                    setChallengeId('');
                    setCaptchaChallenge(null);
                    setCountdown(0);
                    if (timerRef.current) clearInterval(timerRef.current);
                  }}>
                    <SelectTrigger size="lg" aria-label={copy.countryCodeLabel}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  id="auth-phone"
                  type="tel"
                  required
                  size="lg"
                  inputMode="tel"
                  autoComplete="tel"
                  className="min-w-0 flex-1"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setChallengeId('');
                    setCaptchaChallenge(null);
                    setCountdown(0);
                    if (timerRef.current) clearInterval(timerRef.current);
                  }}
                  placeholder={copy.phonePlaceholder}
                />
              </div>
            </div>
            <div ref={captchaHostRef} aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" />

            <div className="space-y-1.5">
              <Label htmlFor="auth-code" required>
                {copy.codeLabel}
              </Label>
              <div className="flex items-start gap-2">
                <Input
                  id="auth-code"
                  type="text"
                  required
                  size="lg"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="min-w-0 flex-1"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={copy.codePlaceholder}
                />
                <Button
                  variant="secondary"
                  size="lg"
                  className="shrink-0"
                  disabled={countdown > 0 || busy}
                  onClick={handleSendCode}
                >
                  {countdown > 0 ? copy.resendCode.replace('{seconds}', countdown) : copy.sendCode}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="auth-email" required>
                {copy.emailLabel}
              </Label>
              <Input
                id="auth-email"
                type="email"
                required
                size="lg"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={copy.emailPlaceholder}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-password" required>
                {copy.passwordLabel}
              </Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  size="lg"
                  className="pr-11"
                  autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    emailMode === 'register' ? copy.passwordNewPlaceholder : copy.passwordPlaceholder
                  }
                />
                <IconButton
                  icon={showPassword ? EyeOff : Eye}
                  label={showPassword ? copy.hidePassword : copy.showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword((prev) => !prev)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="tertiary"
                size="xs"
                onClick={() => {
                  setEmailMode(emailMode === 'login' ? 'register' : 'login');
                  setMessage('');
                }}
              >
                {emailMode === 'login' ? copy.switchToRegister : copy.switchToLogin}
              </Button>
            </div>
          </>
        )}

        {/* danger 让 Alert 输出 role="alert"，校验失败才能被读屏播报 */}
        {message && (
          <Alert tone="danger" icon={<AlertCircle className="size-4" strokeWidth={1.8} />}>
            {message}
          </Alert>
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {submitLabel}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-caption text-ink-subtle">{copy.socialDivider}</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {socialOptionsError ? (
        <div className="flex flex-col items-center gap-2 text-center" role="status">
          <p className="text-caption text-ink-muted">{copy.socialOptionsUnavailable}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSocialOptionsRetry((value) => value + 1)}
          >
            {copy.socialOptionsRetry}
          </Button>
        </div>
      ) : !socialOptions ? (
        <div className="grid grid-cols-3 gap-2" role="status" aria-label={copy.socialOptionsLoading}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md border border-line-subtle bg-wash" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
        {visibleSocialProviders.map(({ id, icon: ProviderIcon, labelKey, available }) => {
          const isLoading = socialLoading === id;
          return (
            <Button
              key={id}
              variant="secondary"
              size="md"
              className="min-w-0"
              disabled={Boolean(socialLoading) || busy || !available}
              loading={isLoading}
              title={!available ? copy.providerInProgressHint : undefined}
              aria-label={!available ? `${copy[labelKey]}，${copy.providerInProgress}` : copy[labelKey]}
              onClick={() => handleSocialLogin(id)}
            >
              {/* SocialIcons 只接收 className/size，多余属性会被忽略。 */}
              {!isLoading && <ProviderIcon size={16} className="size-4" />}
              <span className="min-w-0 truncate">
                {isLoading
                  ? copy.socialConnecting
                  : available
                    ? copy[labelKey]
                    : `${copy[labelKey]} · ${copy.providerInProgress}`}
              </span>
            </Button>
          );
        })}
        </div>
      )}

      {socialOptions?.region === 'mainland_china' && (
        <p className="text-center text-caption text-ink-subtle">{copy.socialRegionProviderNotice}</p>
      )}

      <p className="text-center text-caption text-ink-subtle">
        {copy.termsPrefix}{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="text-ink-muted underline underline-offset-2 transition-colors duration-fast ease-standard hover:text-ink"
        >
          {copy.termsLink}
        </a>{' '}
        {copy.termsJoin}{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-ink-muted underline underline-offset-2 transition-colors duration-fast ease-standard hover:text-ink"
        >
          {copy.privacyLink}
        </a>
      </p>
    </div>
  );

  if (isOpen === false) {
    return null;
  }

  if (isInline) {
    return panel;
  }

  return (
    <Dialog open onOpenChange={(next) => !next && handleClose()}>
      <DialogContent size="sm" showClose={false}>
        {panel}
        <DialogClose
          aria-label={copy.close}
          className={cn(DIALOG_CLOSE_BUTTON, 'absolute right-3 top-3')}
        >
          <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
