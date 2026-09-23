'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveClientLocale } from '@/lib/locales';
import {
  AlertTriangle,
  AudioLines,
  Clapperboard,
  Copy,
  Download,
  Image as ImageIcon,
  Share2,
  Sparkles,
  Trash2,
  WandSparkles,
  User,
} from 'lucide-react';
import Link from 'next/link';
import AuthModal from '@/components/AuthModal';
import ShareToCommunityModal from '@/components/community/ShareToCommunityModal';
import StudioHeader from '@/components/site/StudioHeader';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from 'studio/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastHost } from 'studio/ui/feedback';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'all', labelZh: '全部作品', labelEn: 'All Assets', icon: Sparkles },
  { id: 'image', labelZh: 'AI 生图', labelEn: 'AI Images', icon: ImageIcon },
  { id: 'video', labelZh: 'AI 视频', labelEn: 'AI Videos', icon: Clapperboard },
  { id: 'audio', labelZh: 'AI 音乐', labelEn: 'AI Audio', icon: AudioLines },
  { id: 'workflow', labelZh: '设计与工作流', labelEn: 'Workflows', icon: WandSparkles },
];

function getType(item) {
  const id = String(item.studio_id || item.studioId || '').toLowerCase();
  if (id.includes('video') || id.includes('motion') || id.includes('cinema') || id.includes('clip') || id.includes('lip')) return 'video';
  if (id.includes('audio') || id.includes('music') || id.includes('sound')) return 'audio';
  if (id.includes('workflow') || id.includes('agent') || id.includes('design')) return 'workflow';
  return 'image';
}

function getTypeMeta(type, isZh) {
  return type === 'video'
    ? { label: isZh ? '视频' : 'Video', Icon: Clapperboard }
    : type === 'audio'
    ? { label: isZh ? '音频' : 'Audio', Icon: AudioLines }
    : type === 'workflow'
    ? { label: isZh ? '工作流' : 'Workflow', Icon: WandSparkles }
    : { label: isZh ? '图像' : 'Image', Icon: ImageIcon };
}

function CreationSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-elevation-1">
          <Skeleton className="aspect-square rounded-none bg-wash" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/4 bg-wash-strong" />
            <Skeleton className="h-3 w-1/2 bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CreationCard({ item, isZh, onPreview, onRemix, onShare, onCopy, onDelete }) {
  const type = getType(item);
  const { label, Icon } = getTypeMeta(type, isZh);
  const meta = typeof item.metadata_json === 'object' ? item.metadata_json || {} : {};
  const prompt = item.label || meta.prompt || '';

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-elevation-1 transition duration-base hover:-translate-y-1 hover:border-line-strong hover:shadow-elevation-2 flex flex-col">
      <button
        type="button"
        className="relative block aspect-square w-full overflow-hidden bg-canvas text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
        onClick={() => onPreview(item)}
        aria-label={`${isZh ? '预览作品：' : 'Preview creation: '}${prompt || (isZh ? '未命名作品' : 'Untitled')}`}
      >
        {type === 'video' ? (
          <video
            src={item.result_url}
            muted
            loop
            playsInline
            className="size-full object-cover transition duration-page group-hover:scale-105"
          />
        ) : type === 'audio' ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface text-ink">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash">
              <AudioLines className="size-7 text-ink" />
            </span>
            <span className="text-caption tracking-wider text-ink-muted text-mono">AUDIO ASSET</span>
          </div>
        ) : (
          <img
            src={item.result_url}
            alt={prompt || (isZh ? 'AI 创作' : 'AI Creation')}
            loading="lazy"
            className="size-full object-cover transition duration-page group-hover:scale-105"
          />
        )}

        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-scrim px-2.5 py-1 text-caption font-medium text-ink backdrop-blur-md">
            <Icon className="size-3" />
            {label}
          </span>
        </div>

        {item.is_shared && (
          <span className="absolute right-3 top-3 rounded-full border border-line-strong bg-wash-press px-2.5 py-0.5 text-caption font-medium text-ink backdrop-blur-md">
            {isZh ? '已公开' : 'Public'}
          </span>
        )}

        {/* 悬浮遮罩操作条 */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center gap-2 bg-gradient-to-t from-scrim via-scrim to-transparent px-3.5 pb-3.5 pt-8 opacity-0 transition duration-base group-hover:translate-y-0 group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1 rounded-full text-label font-medium bg-surface-inverse hover:opacity-90 text-ink-inverse gap-1.5 shadow-elevation-1"
            onClick={(event) => {
              event.stopPropagation();
              onRemix(item, event);
            }}
          >
            <WandSparkles className="size-3.5" />
            {isZh ? '做同款' : 'Remix'}
          </Button>
          <IconButton
            icon={Share2}
            size="sm"
            variant="tertiary"
            className="rounded-full bg-wash-press hover:bg-wash-strong text-ink shadow-elevation-1"
            label={isZh ? '分享至社区' : 'Share to community'}
            onClick={(event) => {
              event.stopPropagation();
              onShare(item);
            }}
          />
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 p-3.5 border-t border-line-subtle">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold text-ink">{prompt || (isZh ? '未命名作品' : 'Untitled Creation')}</p>
          <p className="mt-0.5 truncate text-mono text-caption text-ink-subtle">
            {item.model || item.studio_id || 'AI Model'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={Copy}
            size="xs"
            variant="tertiary"
            className="text-ink-muted hover:text-ink hover:bg-wash"
            label={isZh ? '复制提示词' : 'Copy prompt'}
            onClick={(event) => onCopy(prompt, event)}
          />
          <IconButton
            icon={Trash2}
            size="xs"
            variant="tertiary"
            className="text-ink-muted hover:text-danger hover:bg-danger-soft"
            label={isZh ? '删除作品' : 'Delete creation'}
            onClick={(event) => onDelete(item, event)}
          />
        </div>
      </div>
    </div>
  );
}

export default function CreationsClient({ locale: localeProp = null }) {
  const pathname = usePathname();
  const locale = resolveClientLocale({ explicit: localeProp, pathname });
  const isZh = locale.startsWith('zh');
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [shareTarget, setShareTarget] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState({ shared: 0, likes: 0 });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [userResponse, creationsResponse] = await Promise.all([
        fetch('/api/user/profile', { cache: 'no-store' }),
        fetch('/api/creations?limit=100', { cache: 'no-store' }),
      ]);
      const userData = userResponse.ok ? await userResponse.json().catch(() => ({})) : {};
      const creationData = creationsResponse.ok ? await creationsResponse.json().catch(() => ({})) : {};
      if (userData.user) {
        setUser(userData.user);
        setStats({
          shared: userData.user.stats?.publishedPosts || 0,
          likes: userData.user.stats?.totalLikes || 0,
        });
      } else {
        setUser(null);
      }
      if (Array.isArray(creationData.creations)) {
        setCreations(creationData.creations);
      } else {
        setCreations([]);
      }
    } catch {
      setUser(null);
      setCreations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      setDeleting(true);
      const response = await fetch(`/api/creations?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || (isZh ? '删除失败' : 'Failed to delete'));
      setCreations((current) => current.filter((item) => item.id !== id));
      if (previewItem?.id === id) setPreviewItem(null);
      toast.success(isZh ? '作品已成功删除' : 'Creation deleted successfully');
    } catch (error) {
      toast.error(error.message || (isZh ? '删除失败' : 'Failed to delete'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCopy = async (prompt, event) => {
    if (event) event.stopPropagation();
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(isZh ? '提示词已成功复制' : 'Prompt copied to clipboard');
    } catch {
      toast.error(isZh ? '复制失败，请重试' : 'Failed to copy prompt');
    }
  };

  const handleRemix = (item, event) => {
    if (event) event.stopPropagation();
    const type = getType(item);
    const meta = typeof item.metadata_json === 'object' ? item.metadata_json || {} : {};
    const params = new URLSearchParams({
      remixPrompt: item.label || meta.prompt || '',
      remixModel: item.model || meta.model || '',
    });
    window.location.href = `/studio/${type === 'workflow' ? 'workflow' : type}?${params.toString()}`;
  };

  const filteredCreations = useMemo(
    () => creations.filter((item) => selectedCategory === 'all' || getType(item) === selectedCategory),
    [creations, selectedCategory]
  );

  return (
    <main className="min-h-screen bg-base text-ink flex flex-col selection:bg-wash-press">
      <StudioHeader
        action="community"
        locale={locale}
        title={isZh ? '个人作品中心' : 'My Creations'}
        subtitle={isZh ? '管理你的创作资产' : 'Manage your creative assets'}
      />

      {/* 居中主内容区 */}
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 py-8 sm:py-10 flex flex-col gap-8">
        {/* 未登录引导卡片 vs 创作者概览卡片 */}
        {!user ? (
          <div className="rounded-2xl border border-line bg-surface p-8 sm:p-12 shadow-elevation-3 text-center flex flex-col items-center justify-center relative overflow-hidden bg-dot-grid">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-line bg-wash text-brand mb-4 shadow-elevation-1">
              <User className="size-8" />
            </div>
            <h2 className="text-page-title font-semibold tracking-tight text-ink">
              {isZh ? '登录开启云端作品归档' : 'Log in to sync your creations'}
            </h2>
            <p className="mt-2 text-body-sm text-ink-muted max-w-md leading-relaxed">
              {isZh
                ? '登录后即可集中管理你的所有 AI 生图、AI 视频与音频创作资产，随时下载或一键分享至创作者社区。'
                : 'Log in to manage all your AI images, videos, and music assets in one place, download anytime, or share to the community.'}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setShowAuthModal(true)}
              >
                {isZh ? '立即登录 / 注册' : 'Log In / Sign Up'}
              </Button>
              <Button
                asChild
                variant="outline"
                size="md"
              >
                <Link href="/studio">
                  {isZh ? '返回创作工坊' : 'Return to Studio'}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-elevation-2">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-overlay text-ink shadow-elevation-1">
                  <Sparkles className="size-6 text-ink" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-page-title font-semibold tracking-tight text-ink">
                      {user?.display_name || user?.displayName || user?.name || (isZh ? '创作者' : 'Creator')}
                    </h1>
                    <span className="rounded-full border border-line-strong bg-wash-press px-2.5 py-0.5 text-caption font-medium text-ink">
                      AI Creator
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-xl text-body-sm text-ink-muted leading-relaxed font-normal">
                    {user?.bio || (isZh ? '用 AI 拓展想象力的边界，探索下一次创作。' : 'Expanding the boundaries of imagination with AI.')}
                  </p>
                </div>
              </div>

              {/* 数据统计块 */}
              <div className="flex items-center gap-3">
                {[
                  [isZh ? '创作总计' : 'Total Assets', creations.length],
                  [isZh ? '已发社区' : 'Published', stats.shared],
                  [isZh ? '累计获赞' : 'Total Likes', stats.likes],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-24 rounded-xl border border-line-subtle bg-raised px-4 py-3 text-center shadow-elevation-1"
                  >
                    <p className="text-caption text-ink-muted font-medium">{label}</p>
                    <p className="mt-1 text-section-title font-mono text-ink tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 分类过滤器与总计条 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line-subtle pb-5">
          <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-full bg-well border border-line-subtle shadow-elevation-1">
            {CATEGORIES.map(({ id, labelZh, labelEn, icon: Icon }) => {
              const isSelected = selectedCategory === id;
              const label = isZh ? labelZh : labelEn;
              const count = id === 'all'
                ? creations.length
                : creations.filter((item) => getType(item) === id).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedCategory(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-label font-medium transition duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring',
                    isSelected
                      ? 'bg-surface-inverse text-ink-inverse shadow-elevation-1'
                      : 'text-ink-muted hover:text-ink hover:bg-wash active:bg-wash-strong'
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'ml-1 rounded-full px-1.5 py-0.2 text-caption text-mono font-medium',
                        isSelected ? 'bg-wash-press text-ink-inverse' : 'bg-wash text-ink-subtle'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-body-sm text-ink-muted font-normal">
            {isZh ? (
              <>共 <span className="text-mono font-medium text-ink">{filteredCreations.length}</span> 项创作素材</>
            ) : (
              <>Total <span className="text-mono font-medium text-ink">{filteredCreations.length}</span> assets</>
            )}
          </p>
        </div>

        {/* 创作网格展示区 / 空状态 */}
        <section className="flex-1 flex flex-col min-h-96">
          {loading ? (
            <CreationSkeleton />
          ) : !user ? (
            <div className="flex-1 min-h-96 rounded-2xl border border-line-subtle bg-surface p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-elevation-2">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-ink-muted shadow-elevation-1">
                <User className="size-6 text-ink-muted" />
              </div>
              <h3 className="mt-5 text-card-title font-semibold text-ink">
                {isZh ? '请先登录创作者账号' : 'Please log in first'}
              </h3>
              <p className="mt-2 text-body-sm text-ink-muted max-w-md mx-auto leading-relaxed">
                {isZh
                  ? '登录后方可查询与管理你在云端渲染生成的图片、视频和音频历史作品。'
                  : 'Log in to view and manage your generated image, video, and audio assets.'}
              </p>
              <div className="mt-6">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => setShowAuthModal(true)}
                >
                  {isZh ? '立即登录' : 'Log In'}
                </Button>
              </div>
            </div>
          ) : filteredCreations.length === 0 ? (
            <div className="flex-1 min-h-96 rounded-2xl border border-line-subtle bg-surface p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-elevation-2 relative overflow-hidden bg-dot-grid">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-ink shadow-elevation-1">
                <Sparkles className="size-6 text-ink" />
              </div>
              <h3 className="mt-5 text-card-title font-semibold text-ink">
                {isZh ? '暂无此类创作' : 'No creations yet'}
              </h3>
              <p className="mt-2 text-body-sm text-ink-muted max-w-md mx-auto leading-relaxed">
                {isZh
                  ? '前往 Studio 开启一次生成，你的创作成果会自动安全归档到这里。'
                  : 'Head over to Studio to start creating. Your creations will be safely archived here.'}
              </p>
              <div className="mt-6">
                <Button
                  asChild
                  variant="primary"
                  size="md"
                >
                  <Link href="/studio">
                    <Sparkles className="size-4 mr-1.5" />
                    {isZh ? '开始第一次创作' : 'Start your first creation'}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredCreations.map((item) => (
                <CreationCard
                  key={item.id}
                  item={item}
                  isZh={isZh}
                  onPreview={setPreviewItem}
                  onRemix={handleRemix}
                  onShare={setShareTarget}
                  onCopy={handleCopy}
                  onDelete={(creation, event) => {
                    if (event) event.stopPropagation();
                    setDeleteTarget(creation);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {shareTarget && (
        <ShareToCommunityModal
          creation={shareTarget}
          onClose={() => setShareTarget(null)}
          onSuccess={() => {
            toast.success(isZh ? '作品已成功发布至社区画廊' : 'Creation published to community');
            loadData();
          }}
        />
      )}

      {/* 预览大图模态弹窗 */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent size="xl" className="max-w-5xl p-0 overflow-hidden border-line bg-surface shadow-elevation-4">
          <DialogTitle className="sr-only">
            {previewItem?.label || (isZh ? '作品预览' : 'Creation Preview')}
          </DialogTitle>
          <div className="flex flex-col md:flex-row max-h-modal">
            <div className="flex min-h-72 md:min-h-96 flex-1 items-center justify-center bg-base p-4 overflow-hidden">
              {previewItem && (
                getType(previewItem) === 'video' ? (
                  <video
                    src={previewItem.result_url}
                    controls
                    autoPlay
                    className="max-h-modal max-w-full rounded-xl"
                  />
                ) : getType(previewItem) === 'audio' ? (
                  <div className="flex w-full max-w-sm flex-col items-center gap-6">
                    <span className="flex size-20 items-center justify-center rounded-2xl border border-line bg-wash text-ink">
                      <AudioLines className="size-10" />
                    </span>
                    <audio src={previewItem.result_url} controls autoPlay className="w-full" />
                  </div>
                ) : (
                  <img
                    src={previewItem.result_url}
                    alt={previewItem.label || (isZh ? '作品预览' : 'Preview')}
                    className="max-h-modal max-w-full object-contain rounded-xl"
                  />
                )
              )}
            </div>

            <div className="flex w-full flex-col justify-between gap-6 border-t border-line-subtle p-6 md:w-80 md:border-l md:border-t-0 bg-surface">
              <div className="flex flex-col gap-3 min-w-0">
                <Badge tone="neutral" className="w-fit text-caption font-medium">
                  {isZh ? '创作详情' : 'Creation Details'}
                </Badge>
                <h2 className="text-card-title font-semibold text-ink break-words">
                  {previewItem?.label || (isZh ? '未命名作品' : 'Untitled Creation')}
                </h2>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line-subtle bg-canvas p-3 text-body-sm leading-relaxed text-ink scrollbar-rail">
                  {previewItem?.metadata_json?.prompt || previewItem?.label || (isZh ? '无详细提示词' : 'No prompt details')}
                </div>
                {previewItem?.model && (
                  <p className="text-mono text-caption text-ink-muted">
                    {previewItem.model}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  className="gap-2 text-label"
                  onClick={() => handleCopy(previewItem?.metadata_json?.prompt || previewItem?.label)}
                >
                  <Copy className="size-3.5" />
                  {isZh ? '复制提示词' : 'Copy Prompt'}
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  fullWidth
                  className="gap-2 text-label"
                  onClick={() => window.open(previewItem?.result_url, '_blank')}
                >
                  <Download className="size-3.5" />
                  {isZh ? '下载原素材' : 'Download Asset'}
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  fullWidth
                  className="gap-2 text-label"
                  onClick={() => {
                    setDeleteTarget(previewItem);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {isZh ? '删除作品' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认框 */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm" className="sm:max-w-md p-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger mb-3 shadow-elevation-1">
              <AlertTriangle className="size-6 text-danger" />
            </div>
            <AlertDialogHeader className="items-center text-center">
              <AlertDialogTitle className="text-section-title font-semibold text-ink">
                {isZh ? '确定要删除这条作品记录吗？' : 'Delete this creation?'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-body-sm text-ink-muted mt-2 max-w-sm leading-relaxed">
                {isZh
                  ? '此操作无法撤销。作品资产将从云端彻底移除；若已发布到创作者社区，也将同步从公共画廊永久下架。'
                  : 'This action cannot be undone. The creative asset will be permanently deleted and unlisted from the community gallery.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="mt-4 sm:space-x-3">
            <AlertDialogCancel disabled={deleting} className="text-label font-medium">
              {isZh ? '取消' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={deleting}
              className="text-label font-medium"
              onClick={() => {
                if (deleteTarget) {
                  handleDelete(deleteTarget.id);
                }
              }}
            >
              {deleting ? (isZh ? '正在删除…' : 'Deleting…') : (isZh ? '确定删除' : 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 登录/注册弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            loadData();
          }}
        />
      )}

      {/* 全局通知挂载点 */}
      <ToastHost />
    </main>
  );
}
