'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CHANNEL_LABELS, channelKindOf } from '@/lib/modelCenter/view';
import {
  channelAvailability,
  isPrimaryChannel,
  primaryChannelOf,
} from '@/lib/modelCenter/routing';
import { Pin } from 'lucide-react';

/**
 * 「这个模型现在实际走哪家供应商」。
 *
 * 必须读主渠道而不是 models_config.provider：后者是一个展示列，挂多家供应商时
 * 它既不是运行时选出来的那家，也不会随后台切换而改变，显示出来就是假信息。
 */
export default function ModelPrimaryProvider({ model, className }) {
  const channel = primaryChannelOf(model);

  if (!channel) {
    return (
      <div className={cn('min-w-0', className)}>
        <p className="truncate text-body-sm text-ink-muted">{model.provider || '—'}</p>
        <p className="truncate text-caption text-ink-subtle">未挂载渠道 · 按目录字段调用</p>
      </div>
    );
  }

  const availability = channelAvailability(channel);
  const slug = channel.providerSlug || channel.providerId;
  const kind = CHANNEL_LABELS[channelKindOf(channel)] || '—';

  return (
    <div className={cn('min-w-0', className)}>
      <p className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn('truncate text-body-sm', availability.usable ? 'text-ink' : 'text-danger')}
          title={channel.providerModelId}
        >
          {channel.providerName || slug}
        </span>
        {isPrimaryChannel(channel) && (
          <Badge tone="brand" className="shrink-0 px-1 py-0" title="管理员钉选的主渠道">
            <Pin className="size-2.5" aria-hidden />
            钉选
          </Badge>
        )}
      </p>
      <p className="truncate font-mono text-caption lowercase text-ink-subtle">
        {slug} · {kind}
        {!availability.usable && <span className="text-danger"> · {availability.reason}</span>}
      </p>
    </div>
  );
}
