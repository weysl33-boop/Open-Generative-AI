import React from 'react';

/**
 * 导航与模型专属高亮角标组件 (严格遵循 UI_DESIGN_SYSTEM.md 规范)
 */
export default function NavBadge({ badge, className = '' }) {
  if (!badge) return null;

  const b = String(badge).toUpperCase();

  let colorStyle = 'bg-wash-strong text-ink-muted border-line';

  if (b === 'TOP') {
    colorStyle = 'bg-danger text-ink-inverse font-bold shadow-elevation-1';
  } else if (b === 'NEW') {
    colorStyle = 'bg-success text-ink-inverse font-bold shadow-elevation-1';
  } else if (b === 'HOT') {
    colorStyle = 'bg-warning text-ink-inverse font-bold shadow-elevation-1';
  } else if (b === 'FREE') {
    colorStyle = 'bg-info text-ink-inverse font-bold shadow-elevation-1';
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-micro font-bold uppercase tracking-wider select-none ${colorStyle} ${className}`}
      aria-label={`Tag: ${b}`}
    >
      {b}
    </span>
  );
}
