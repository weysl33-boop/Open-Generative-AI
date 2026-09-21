'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AlertCircle, Eye, EyeOff, Layers, X } from 'lucide-react';
import { DouyinIcon, GoogleIcon, QQIcon, TikTokIcon, WeChatIcon, XIcon } from './SocialIcons';
import { Alert } from 'studio/ui/feedback';
import {
  DIALOG_CLOSE_BUTTON,
  FOCUS_RING,
  SCRIM,
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

/**
 * 登录框的视觉契约：圆角胶囊输入框、居中胶囊分段器、青色渐变主按钮。
 * 全部由 globals.css 的语义 token 组成，不引入字面色值，避免再被通用
 * Dialog/Button 原语拉回"灰底方框 + 实色按钮"的另一套长相。
 */
const FIELD = cn(
  'h-11 w-full rounded-lg border border-line-strong bg-well px-4 text-body text-ink',
  'placeholder:text-ink-subtle',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  FOCUS_RING,
);

const FIELD_WRAP = cn(
  'flex h-11 w-full items-center rounded-lg border border-line-strong bg-well px-4',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus-within:border-brand',
);

const BARE_INPUT =
  'w-full min-w-0 bg-transparent text-body text-ink placeholder:text-ink-subtle outline-none';

const TAB_PILL = cn(
  'h-8 shrink-0 grow basis-0 rounded-lg border px-3 text-label font-medium',
  'transition-[background-color,border-color,color] duration-fast ease-standard',
  FOCUS_RING,
);

const SUBMIT = cn(
  'flex h-11 w-full items-center justify-center rounded-lg text-body font-semibold',
  'bg-gradient-to-r from-brand to-brand-hover text-ink-on-accent shadow-elevation-brand',
  'transition-[opacity,filter] duration-fast ease-standard hover:opacity-90',
  'disabled:cursor-wait disabled:opacity-50',
  FOCUS_RING,
);

const SOCIAL_PILL = cn(
  'flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-well px-2',
  'text-label font-medium text-ink',
  'transition-[background-color,border-color] duration-fast ease-standard',
  'hover:border-line-strong hover:bg-wash-strong',
  'disabled:cursor-not-allowed disabled:opacity-50',
  FOCUS_RING,
);

const TEXT_LINK = cn(
  'text-caption text-ink-subtle transition-colors duration-fast ease-standard hover:text-ink',
  FOCUS_RING,
);

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
  const Heading = isInline ? 'h2' : DialogPrimitive.Title;
  const Description = isInline ? 'p' : DialogPrimitive.Description;

  const panel = (
    <div className="flex flex-col">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-11 items-center justify-center rounded-lg bg-brand text-ink-on-accent shadow-elevation-brand">
          <Layers className="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <Heading className="mt-4 text-section-title text-ink">{title}</Heading>
        <Description className="mt-1 text-body-sm text-ink-muted">{copy.subtitle}</Description>
      </div>

      <div className="mt-6 flex justify-center">
        <div
          role="group"
          aria-label={copy.modeLabel}
          className="inline-flex rounded-xl border border-line bg-well p-1"
        >
          {[
            { value: 'email', label: copy.tabEmail },
            { value: 'phone', label: copy.tabPhone },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              className={cn(
                TAB_PILL,
                mode === option.value
                  ? 'border-line-accent bg-brand-pressed text-brand'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              onClick={() => {
                setMode(option.value);
                setMessage('');
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
        {mode === 'phone' ? (
          <>
            <div className={FIELD_WRAP}>
              <select
                value={countryCode}
                aria-label={copy.countryCodeLabel}
                className="shrink-0 bg-transparent text-body font-medium text-ink outline-none"
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setChallengeId('');
                  setCaptchaChallenge(null);
                  setCountdown(0);
                  if (timerRef.current) clearInterval(timerRef.current);
                }}
              >
                {COUNTRY_CODES.map((item) => (
                  <option key={item} value={item} className="bg-canvas text-ink">
                    {item}
                  </option>
                ))}
              </select>
              <span className="mx-3 h-4 w-px shrink-0 bg-line" aria-hidden="true" />
              <input
                id="auth-phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                aria-label={copy.phoneLabel}
                className={BARE_INPUT}
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
            <div ref={captchaHostRef} aria-hidden="true" className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" />

            <div className={FIELD_WRAP}>
              <input
                id="auth-code"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                aria-label={copy.codeLabel}
                className={BARE_INPUT}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={copy.codePlaceholder}
              />
              <span className="mx-3 h-4 w-px shrink-0 bg-line" aria-hidden="true" />
              <button
                type="button"
                className={cn(
                  'shrink-0 text-label font-medium text-brand',
                  'transition-colors duration-fast ease-standard hover:text-brand-hover',
                  'disabled:cursor-not-allowed disabled:text-ink-disabled',
                  FOCUS_RING,
                )}
                disabled={countdown > 0 || busy}
                onClick={handleSendCode}
              >
                {countdown > 0 ? copy.resendCode.replace('{seconds}', countdown) : copy.sendCode}
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              aria-label={copy.emailLabel}
              className={FIELD}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.emailPlaceholder}
            />

            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                aria-label={copy.passwordLabel}
                className={cn(FIELD, 'pr-11')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  emailMode === 'register' ? copy.passwordNewPlaceholder : copy.passwordPlaceholder
                }
              />
              <button
                type="button"
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                className={cn(
                  'absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center',
                  'rounded-md text-ink-subtle',
                  'transition-[background-color,color] duration-fast ease-standard',
                  'hover:bg-wash hover:text-ink',
                  FOCUS_RING,
                )}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
                  <EyeOff className="size-4" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Eye className="size-4" strokeWidth={1.8} aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className={TEXT_LINK}
                onClick={() => {
                  setEmailMode(emailMode === 'login' ? 'register' : 'login');
                  setMessage('');
                }}
              >
                {emailMode === 'login' ? copy.switchToRegister : copy.switchToLogin}
              </button>
            </div>
          </>
        )}

        {/* danger 让 Alert 输出 role="alert"，校验失败才能被读屏播报 */}
        {message && (
          <Alert tone="danger" icon={<AlertCircle className="size-4" strokeWidth={1.8} />}>
            {message}
          </Alert>
        )}

        <button type="submit" className={SUBMIT} disabled={busy}>
          {submitLabel}
        </button>
      </form>

      <div className="mt-8 flex items-center gap-3">
        <span className="h-px flex-1 bg-line-subtle" />
        <span className="text-caption text-ink-subtle">{copy.socialDivider}</span>
        <span className="h-px flex-1 bg-line-subtle" />
      </div>

      {socialOptionsError ? (
        <div className="mt-4 flex flex-col items-center gap-2 text-center" role="status">
          <p className="text-caption text-ink-muted">{copy.socialOptionsUnavailable}</p>
          <button
            type="button"
            className={cn(TEXT_LINK, 'font-medium text-brand hover:text-brand-hover')}
            onClick={() => setSocialOptionsRetry((value) => value + 1)}
          >
            {copy.socialOptionsRetry}
          </button>
        </div>
      ) : !socialOptions ? (
        <div className="mt-6 grid grid-cols-3 gap-2" role="status" aria-label={copy.socialOptionsLoading}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg border border-line-subtle bg-well" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {visibleSocialProviders.map(({ id, icon: ProviderIcon, labelKey, available }) => {
            const isLoading = socialLoading === id;
            return (
              <button
                key={id}
                type="button"
                className={SOCIAL_PILL}
                disabled={Boolean(socialLoading) || busy || !available}
                aria-busy={isLoading || undefined}
                title={!available ? copy.providerInProgressHint : undefined}
                aria-label={!available ? `${copy[labelKey]}，${copy.providerInProgress}` : copy[labelKey]}
                onClick={() => handleSocialLogin(id)}
              >
                {/* SocialIcons 只接收 className/size，多余属性会被忽略。 */}
                {isLoading ? (
                  <span
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-brand"
                    aria-hidden="true"
                  />
                ) : (
                  <ProviderIcon size={16} className="size-4 shrink-0" />
                )}
                <span className="min-w-0 truncate">
                  {isLoading
                    ? copy.socialConnecting
                    : available
                      ? copy[labelKey]
                      : `${copy[labelKey]} · ${copy.providerInProgress}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {socialOptions?.region === 'mainland_china' && (
        <p className="mt-3 text-center text-caption text-ink-subtle">{copy.socialRegionProviderNotice}</p>
      )}

      <p className="mt-6 text-center text-caption text-ink-subtle">
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
    <DialogPrimitive.Root open onOpenChange={(next) => !next && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-modal max-h-modal w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'overflow-y-auto rounded-xl border border-line bg-canvas px-8 pb-8 pt-10 text-ink',
            'shadow-elevation-4 animate-scale-in',
            'max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0',
            'max-md:max-h-sheet max-md:rounded-b-none max-md:rounded-t-xl max-md:px-5 max-md:pb-6 max-md:pt-8',
          )}
        >
          {panel}
          <DialogPrimitive.Close
            aria-label={copy.close}
            className={cn(DIALOG_CLOSE_BUTTON, 'absolute right-3 top-3')}
          >
            <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
