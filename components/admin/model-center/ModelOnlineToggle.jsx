'use client';

import { cn } from '@/lib/utils';

/**
 * 卡片/列表共用的上线开关。下线属高风险动作，确认逻辑由调用方处理。
 */
export default function ModelOnlineToggle({ model, disabled, pending, onChange }) {
  const online = model.isActive;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      aria-label={`${online ? '下线' : '上线'} ${model.name}`}
      title={disabled ? '只读权限，无法修改模型状态' : online ? '点击下线' : '点击上线'}
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation();
        onChange(model);
      }}
      className={cn(
        'group/toggle inline-flex shrink-0 items-center gap-1.5 rounded-full border px-1.5 py-0.5',
        'transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-45',
        online
          ? 'border-success-line bg-success-soft'
          : 'border-line bg-well hover:border-line-strong'
      )}
    >
      <span
        className={cn(
          'relative h-3.5 w-6 rounded-full transition-colors duration-fast',
          online ? 'bg-success' : 'bg-ink-disabled'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-overlay transition-transform duration-fast',
            online ? 'translate-x-3' : 'translate-x-0.5'
          )}
        />
      </span>
      <span
        className={cn(
          'font-mono text-caption font-semibold uppercase leading-3',
          online ? 'text-success' : 'text-ink-subtle'
        )}
      >
        {online ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
