'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from 'studio/ui/overlay';
import { cn } from '@/lib/utils';
import {
  Eye,
  MoreHorizontal,
  PlugZap,
  Route,
  ScrollText,
  SlidersHorizontal,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

export default function ModelActionsMenu({
  model,
  canWrite,
  busy,
  onViewDetail,
  onConfigure,
  onTestRoute,
  onToggleActive,
}) {
  const firstChannel =
    (model.routes || []).find((r) => r.enabled && r.providerEnabled) || model.routes?.[0];
  const online = model.isActive;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${model.name} 更多操作`}
          className="text-ink-subtle data-[state=open]:bg-wash-strong data-[state=open]:text-ink"
          onClick={(event) => event.stopPropagation()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
        </Button>
      </MenuTrigger>

      <MenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        <MenuLabel>{model.id}</MenuLabel>

        <MenuItem onSelect={onViewDetail}>
          <Eye className="size-3.5 shrink-0" />
          查看详情
        </MenuItem>
        {canWrite && (
          <MenuItem onSelect={onConfigure}>
            <SlidersHorizontal className="size-3.5 shrink-0" />
            配置定价与接入
          </MenuItem>
        )}
        <MenuItem asChild>
          <Link href="/admin/models/routing" className="px-2.5">
            <Route className="size-3.5 shrink-0" />
            供应商路由
          </Link>
        </MenuItem>
        <MenuItem disabled={!canWrite || !firstChannel || busy} onSelect={onTestRoute}>
          <PlugZap className="size-3.5 shrink-0" />
          探测渠道
        </MenuItem>
        <MenuItem asChild>
          <Link href={`/admin/audit?q=${encodeURIComponent(model.id)}`} className="px-2.5">
            <ScrollText className="size-3.5 shrink-0" />
            查看日志
          </Link>
        </MenuItem>

        {canWrite && (
          <>
            <MenuSeparator />
            <MenuItem
              disabled={busy}
              className={cn(
                online
                  ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
                  : 'text-success hover:bg-success-soft focus:bg-success-soft'
              )}
              onSelect={() => onToggleActive(model)}
            >
              <ShieldAlert className="size-3.5 shrink-0" />
              {online ? '下线模型' : '上线模型'}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
