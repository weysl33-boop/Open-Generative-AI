'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/site/StudioHeader';
import { getCommonCopy, normalizeLocale } from '@/lib/locales';
import { cn } from '@/lib/utils';
import StepIdentity from './StepIdentity';
import StepPreference from './StepPreference';

const TOTAL_STEPS = 2;

export default function OnboardingFlow({ initialStep = 1, initialUser, studioHref }) {
  const locale = normalizeLocale(initialUser?.locale || 'en');
  const copy = getCommonCopy(locale).onboarding;
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState({
    displayName: initialUser?.displayName || '',
    avatarUrl: initialUser?.avatarUrl || '',
  });

  const run = useCallback(async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (err) {
      setError(err?.message || copy.errorGeneric);
      return false;
    } finally {
      setBusy(false);
    }
  }, [copy.errorGeneric]);

  const handleIdentityDone = (next) =>
    run(async () => {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 1, displayName: next.displayName, avatarUrl: next.avatarUrl || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || copy.errorGeneric);
      setIdentity(next);
      setStep(2);
    });

  const handlePreferenceDone = (answers) =>
    run(async () => {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 2, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || copy.errorGeneric);
      window.location.href = studioHref;
    });

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 xs:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <BrandMark compact />
          <span className="text-caption text-ink-subtle">
            {copy.progress.replace('{current}', String(step)).replace('{total}', String(TOTAL_STEPS))}
          </span>
        </header>

        <div className="mt-6 flex items-center gap-3" aria-hidden="true">
          {[1, 2].map((index) => (
            <div
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-slow ease-standard',
                step >= index ? 'bg-brand' : 'bg-line',
              )}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {[
            { index: 1, label: copy.stepIdentity },
            { index: 2, label: copy.stepPreference },
          ].map(({ index, label }) => (
            <span
              key={index}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro',
                step === index
                  ? 'border-brand-line bg-brand-soft text-brand'
                  : 'border-line bg-transparent text-ink-subtle',
              )}
            >
              {step > index ? <Check className="size-3" /> : <span className="font-mono">{index}</span>}
              <span>{label}</span>
            </span>
          ))}
        </div>

        <div className="mt-5 flex-1">
          {step === 1 ? (
            <StepIdentity
              copy={copy}
              isZh={locale.startsWith('zh')}
              userNumber={initialUser?.userNumber}
              initialDisplayName={identity.displayName}
              initialAvatarUrl={identity.avatarUrl}
              busy={busy}
              onDone={handleIdentityDone}
            />
          ) : (
            <StepPreference
              copy={copy}
              isZh={locale.startsWith('zh')}
              busy={busy}
              onBack={() => { setError(''); setStep(1); }}
              onSubmit={handlePreferenceDone}
            />
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-2.5 text-body-sm text-danger">
            {error}
          </p>
        )}

        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-line-subtle pt-5">
          <p className="hidden text-caption text-ink-subtle sm:block">{copy.privacyNote}</p>
          {step === 2 && (
            <Button variant="secondary" size="md" onClick={() => { setError(''); setStep(1); }} disabled={busy} className="ml-auto">
              <ArrowLeft className="size-3.5" />
              <span>{copy.back}</span>
            </Button>
          )}
        </footer>
      </div>
    </main>
  );
}
