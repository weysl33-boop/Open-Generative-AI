'use client';

// Adapted from SamurAIGPT/ai-headshot-generator's CreditBadge component.
// Behavior is retained while colors/radius follow the KoyoSIM Studio shell.
export default function CreditBadge({ credits = 0, label = 'Credits', className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-line bg-wash px-3 py-1.5 text-xs font-semibold text-ink-muted ${className}`}>
      <span className="text-warning" aria-hidden="true">◆</span>
      <span>{credits} {label}</span>
    </div>
  );
}
