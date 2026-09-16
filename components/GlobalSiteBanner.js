'use client';

import { useState } from 'react';

export default function GlobalSiteBanner({ banner }) {
  const [dismissed, setDismissed] = useState(false);

  if (!banner?.enabled || !banner?.message || dismissed) {
    return null;
  }

  const toneStyles = {
    info: 'bg-cyan-950/80 border-cyan-500/30 text-cyan-200',
    warn: 'bg-amber-950/80 border-amber-500/30 text-amber-200',
    danger: 'bg-rose-950/80 border-rose-500/30 text-rose-200',
    success: 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200',
  };

  const currentTone = toneStyles[banner.tone] || toneStyles.info;

  return (
    <div
      role="alert"
      className={`relative z-50 flex items-center justify-between border-b px-4 py-2 text-xs font-medium backdrop-blur-md transition-all ${currentTone}`}
    >
      <div className="mx-auto flex items-center gap-2 text-center">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        <span>{banner.message}</span>
      </div>

      {banner.dismissible !== false && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-4 rounded-lg p-1 opacity-70 hover:bg-white/10 hover:opacity-100 transition"
          aria-label="关闭公告"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
