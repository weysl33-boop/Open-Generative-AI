'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from 'studio/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'studio/ui/overlay';
import { cn } from '@/lib/utils';
import { Loader2, X } from 'lucide-react';

const BULK_ACTIONS = [
  { value: 'online', label: '批量上线', kind: null, danger: false },
  { value: 'offline', label: '批量下线', kind: null, danger: true },
  { value: 'credits', label: '统一设为固定 Credits', kind: 'number', danger: false },
  { value: 'markup', label: '按成本倍率重算 Credits', kind: 'number', danger: false },
  { value: 'provider', label: '改接供应商', kind: 'provider', danger: false },
];

const NUMBER_HINT = {
  credits: 'Credits 点数',
  markup: '目标倍率，如 2.5',
};

export default function BulkActionBar({
  count,
  providers,
  busy,
  progress,
  onApply,
  onClear,
}) {
  const [action, setAction] = useState('online');
  const [number, setNumber] = useState('');
  const [provider, setProvider] = useState('');

  if (!count) return null;
  const current = BULK_ACTIONS.find((item) => item.value === action) || BULK_ACTIONS[0];
  const needsValue = current.kind !== null;
  const invalid =
    current.kind === 'number' && !(Number(number) > 0)
      ? true
      : current.kind === 'provider' && !provider;

  return (
    <div className="fixed bottom-6 left-1/2 z-header flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-line bg-overlay px-3 py-2 shadow-elevation-3">
      <span className="flex items-center gap-2 pr-1 text-body-sm text-ink">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-soft px-1.5 font-mono text-caption tabular-nums text-brand">
          {count}
        </span>
        个模型已选择
      </span>

      <span className="h-5 w-px bg-line-subtle" aria-hidden />

      <div className="w-[196px] shrink-0">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger size="sm" aria-label="批量操作类型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BULK_ACTIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {current.kind === 'number' && (
        <div className="w-[160px] shrink-0">
          <Input
            size="sm"
            type="number"
            min="0"
            step={current.value === 'markup' ? '0.1' : '1'}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder={NUMBER_HINT[current.value]}
            aria-label={NUMBER_HINT[current.value]}
          />
        </div>
      )}

      {current.kind === 'provider' && (
        <div className="w-[180px] shrink-0">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" aria-label="目标供应商">
              <SelectValue>选择供应商</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {providers.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.value} · {item.count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        variant={current.danger ? 'danger' : 'primary'}
        size="sm"
        disabled={busy || invalid}
        onClick={() =>
          onApply({
            action: current.value,
            credits: current.kind === 'number' ? Number(number) : undefined,
            markup: current.kind === 'markup' ? Number(number) : undefined,
            provider: current.kind === 'provider' ? provider : undefined,
          })
        }
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        {busy && progress ? `执行中 ${progress.done}/${progress.total}` : '应用'}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onClear}
        className={cn('gap-1 text-ink-subtle')}
      >
        <X className="size-3.5" />
        取消选择
      </Button>
    </div>
  );
}
