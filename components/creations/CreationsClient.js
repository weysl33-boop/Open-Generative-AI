'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveClientLocale } from '@/lib/locales';
import {
  AudioLines,
  Clapperboard,
  Copy,
  Download,
  Image as ImageIcon,
  MoreHorizontal,
  Play,
  Share2,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  User,
} from 'lucide-react';
import Link from 'next/link';
import AuthModal from '@/components/AuthModal';
import ShareToCommunityModal from '@/components/community/ShareToCommunityModal';
import StudioHeader from '@/components/site/StudioHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORIES = [
  { id: 'all', label: '全部作品', icon: Sparkles },
  { id: 'image', label: 'AI 生图', icon: ImageIcon },
  { id: 'video', label: 'AI 视频', icon: Clapperboard },
  { id: 'audio', label: 'AI 音乐', icon: AudioLines },
  { id: 'workflow', label: '设计与工作流', icon: WandSparkles },
];

function getType(item) {
  const id = String(item.studio_id || '').toLowerCase();
  if (id.includes('video') || id.includes('motion') || id.includes('cinema') || id.includes('clip') || id.includes('lip')) return 'video';
  if (id.includes('audio') || id.includes('music') || id.includes('sound')) return 'audio';
  if (id.includes('workflow') || id.includes('agent') || id.includes('design')) return 'workflow';
  return 'image';
}

function getTypeMeta(type) {
  return type === 'video'
    ? { label: '视频', Icon: Clapperboard }
    : type === 'audio'
    ? { label: '音频', Icon: AudioLines }
    : type === 'workflow'
    ? { label: '工作流', Icon: WandSparkles }
    : { label: '图像', Icon: ImageIcon };
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

function CreationCard({ item, onPreview, onRemix, onShare, onCopy, onDelete }) {
  const type = getType(item);
  const { label, Icon } = getTypeMeta(type);
  const meta = typeof item.metadata_json === 'object' ? item.metadata_json || {} : {};
  const prompt = item.label || meta.prompt || '';

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-elevation-2 transition-all duration-base hover:-translate-y-1 hover:border-line-strong flex flex-col">
      <button
        type="button"
        className="relative block aspect-square w-full overflow-hidden bg-canvas text-left focus-visible:outline-none"
        onClick={() => onPreview(item)}
        aria-label={`预览作品：${prompt || '未命名作品'}`}
      >
        {type === 'video' ? (
          <video
            src={item.result_url}
            muted
            loop
            playsInline
            className="size-full object-cover transition duration-page group-hover:scale-[1.03]"
          />
        ) : type === 'audio' ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface text-ink">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash">
              <AudioLines className="size-7 text-ink" />
            </span>
            <span className="text-xs tracking-wider text-ink-muted font-mono">AUDIO ASSET</span>
          </div>
        ) : (
          <img
            src={item.result_url}
            alt={prompt || 'AI 创作'}
            loading="lazy"
            className="size-full object-cover transition duration-page group-hover:scale-[1.03]"
          />
        )}

        <div className="absolute left-3 top-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-scrim px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur-md">
            <Icon className="size-3" />
            {label}
          </span>
        </div>

        {item.is_shared && (
          <span className="absolute right-3 top-3 rounded-full border border-line-strong bg-wash-press px-2.5 py-1 text-micro font-medium text-ink backdrop-blur-md">
            已公开
          </span>
        )}

        {/* 悬浮遮罩操作条 */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center gap-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3.5 pb-3.5 pt-8 opacity-0 transition-all duration-base group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            className="flex-1 h-8 rounded-full bg-surface-inverse hover:bg-white/90 text-ink-on-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            onClick={(event) => {
              event.stopPropagation();
              onRemix(item, event);
            }}
          >
            <WandSparkles className="size-3.5" />
            做同款
          </button>
          <button
            type="button"
            className="size-8 rounded-full bg-wash-press hover:bg-wash-press text-ink flex items-center justify-center transition-colors"
            aria-label="分享至社区"
            onClick={(event) => {
              event.stopPropagation();
              onShare(item);
            }}
          >
            <Share2 className="size-3.5" />
          </button>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 p-3.5 border-t border-line-subtle">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{prompt || '未命名作品'}</p>
          <p className="mt-0.5 truncate font-mono text-micro text-ink-subtle">
            {item.model || item.studio_id || 'AI Model'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="复制提示词"
            onClick={(event) => onCopy(prompt, event)}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-wash transition-colors"
            title="复制提示词"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="删除作品"
            className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-wash transition-colors"
            onClick={(event) => onDelete(item.id, event)}
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </button>
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
  const [toastMessage, setToastMessage] = useState('');
  const [stats, setStats] = useState({ shared: 0, likes: 0 });

  const showToast = (message) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(''), 2800);
  };

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

  const handleDelete = async (id, event) => {
    event.stopPropagation();
    if (!window.confirm('确定要删除这条作品记录吗？若已发布到社区也将一并下架。')) return;
    try {
      const response = await fetch(`/api/creations?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || '删除失败');
      setCreations((current) => current.filter((item) => item.id !== id));
      if (previewItem?.id === id) setPreviewItem(null);
      showToast('作品已删除');
    } catch (error) {
      showToast(error.message || '删除失败');
    }
  };

  const handleCopy = async (prompt, event) => {
    event.stopPropagation();
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    showToast('提示词已成功复制');
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

      {toastMessage && (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-line bg-raised/95 px-5 py-2.5 text-xs font-medium text-ink shadow-elevation-4 backdrop-blur-xl animate-float-in"
        >
          {toastMessage}
        </div>
      )}

      {/* 居中主内容区，充满屏幕并带优雅呼吸感 */}
      <div className="flex-1 mx-auto w-full max-w-[1360px] px-6 sm:px-8 lg:px-12 py-8 sm:py-10 flex flex-col gap-8">
        {/* 未登录引导卡片 vs 创作者概览卡片 */}
        {!user ? (
          <div className="rounded-2xl border border-line bg-surface/95 p-8 sm:p-12 backdrop-blur-md shadow-elevation-3 text-center flex flex-col items-center justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-line bg-wash text-brand mb-4 shadow-inner">
              <User className="size-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">登录开启云端作品归档</h2>
            <p className="mt-2 text-sm text-ink-muted max-w-md leading-relaxed">
              登录后即可集中管理你的所有 AI 生图、AI 视频与音频创作资产，随时下载或一键分享至创作者社区。
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="h-10 px-6 rounded-full bg-surface-inverse text-ink-on-accent font-semibold hover:bg-surface-inverse transition-all cursor-pointer shadow-elevation-2"
              >
                立即登录 / 注册
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-10 px-6 rounded-full border-line text-ink hover:bg-wash hover:text-ink"
              >
                <Link href="/studio">返回创作工坊</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface/95 p-6 sm:p-8 backdrop-blur-md shadow-elevation-3">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-overlay text-ink shadow-inner">
                  <Sparkles className="size-6 text-ink" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                      {user?.display_name || user?.displayName || user?.name || '创作者'}
                    </h1>
                    <span className="rounded-full border border-line-strong bg-wash-press px-2.5 py-0.5 text-[11px] font-medium text-ink">
                      AI Creator
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-xl text-xs sm:text-sm text-ink-muted leading-relaxed font-normal">
                    {user?.bio || '用 AI 拓展想象力的边界，探索下一次创作。'}
                  </p>
                </div>
              </div>

              {/* 数据统计块 */}
              <div className="flex items-center gap-3">
                {[
                  ['创作总计', creations.length],
                  ['已发社区', stats.shared],
                  ['累计获赞', stats.likes],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-[96px] rounded-xl border border-line-subtle bg-raised/80 px-4 py-3 text-center shadow-elevation-1"
                  >
                    <p className="text-[11px] text-ink-muted font-medium">{label}</p>
                    <p className="mt-1 text-lg font-bold font-mono text-ink tabular-nums">
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
          <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface border border-line">
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const isSelected = selectedCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedCategory(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-surface-inverse text-ink-inverse shadow-elevation-2'
                      : 'text-ink-muted hover:text-ink hover:bg-wash'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-ink-muted font-normal">
            共 <span className="font-mono text-ink font-bold">{filteredCreations.length}</span> 项创作素材
          </p>
        </div>

        {/* 创作网格展示区 / 空状态 */}
        <section className="flex-1 flex flex-col min-h-[420px]">
          {loading ? (
            <CreationSkeleton />
          ) : !user ? (
            <div className="flex-1 rounded-2xl border border-line-subtle bg-surface/80 backdrop-blur-sm p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-elevation-3">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-ink-subtle shadow-inner">
                <User className="size-6 text-ink-muted" />
              </div>
              <h3 className="mt-5 text-base font-bold text-ink tracking-wide">请先登录创作者账号</h3>
              <p className="mt-2 text-xs sm:text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
                登录后方可查询与管理你在云端渲染生成的图片、视频和音频历史作品。
              </p>
              <div className="mt-6">
                <Button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="rounded-full bg-surface-inverse hover:bg-white/90 text-ink-on-accent px-6 py-2.5 text-xs sm:text-sm font-semibold shadow-elevation-2 transition-transform active:scale-95 cursor-pointer"
                >
                  立即登录
                </Button>
              </div>
            </div>
          ) : filteredCreations.length === 0 ? (
            <div className="flex-1 rounded-2xl border border-line-subtle bg-surface/80 backdrop-blur-sm p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-elevation-3">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-ink shadow-inner">
                <Sparkles className="size-6 text-ink" />
              </div>
              <h3 className="mt-5 text-base font-bold text-ink tracking-wide">暂无此类创作</h3>
              <p className="mt-2 text-xs sm:text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
                前往 Studio 开启一次生成，你的创作成果会自动安全归档到这里。
              </p>
              <div className="mt-6">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-2 rounded-full bg-surface-inverse hover:bg-white/90 text-ink-on-accent px-6 py-2.5 text-xs sm:text-sm font-semibold shadow-elevation-2 transition-transform active:scale-95"
                >
                  <Sparkles className="size-4" />
                  开始第一次创作
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredCreations.map((item) => (
                <CreationCard
                  key={item.id}
                  item={item}
                  onPreview={setPreviewItem}
                  onRemix={handleRemix}
                  onShare={setShareTarget}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
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
            showToast('作品已成功发布至社区画廊');
            loadData();
          }}
        />
      )}

      {/* 预览大图模态弹窗 */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-md"
          onClick={() => setPreviewItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevation-4 md:flex-row backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-wash-strong hover:text-ink transition-colors"
              onClick={() => setPreviewItem(null)}
              aria-label="关闭预览"
            >
              <X className="size-4" />
            </button>

            <div className="flex min-h-80 flex-1 items-center justify-center bg-base p-4 md:min-h-[560px]">
              {getType(previewItem) === 'video' ? (
                <video
                  src={previewItem.result_url}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-xl"
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
                  alt="作品预览"
                  className="max-h-[70vh] max-w-full object-contain rounded-xl"
                />
              )}
            </div>

            <div className="flex w-full flex-col justify-between gap-6 border-t border-line-subtle p-6 md:w-80 md:border-l md:border-t-0 bg-surface">
              <div>
                <span className="inline-block rounded-full border border-line-strong bg-wash-press px-2.5 py-0.5 text-xs text-ink font-medium">
                  创作详情
                </span>
                <h2 className="mt-3 text-base font-bold text-ink">
                  {previewItem.label || '未命名作品'}
                </h2>
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-line-subtle bg-canvas p-3 text-xs leading-relaxed text-ink scrollbar-none [&::-webkit-scrollbar]:hidden">
                  {previewItem.metadata_json?.prompt || previewItem.label || '无详细提示词'}
                </div>
                {previewItem.model && (
                  <p className="mt-3 font-mono text-[11px] text-ink-muted">
                    {previewItem.model}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 border-line bg-wash hover:bg-wash-press text-ink rounded-xl gap-2 text-xs"
                  onClick={() => handleCopy(previewItem.metadata_json?.prompt || previewItem.label)}
                >
                  <Copy className="size-3.5" />
                  复制提示词
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 border-line bg-wash hover:bg-wash-press text-ink rounded-xl gap-2 text-xs"
                  onClick={() => window.open(previewItem.result_url, '_blank')}
                >
                  <Download className="size-3.5" />
                  下载原画
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </main>
  );
}
