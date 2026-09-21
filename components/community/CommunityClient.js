'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { resolveClientLocale } from '@/lib/locales';
import {
  AudioLines,
  Clapperboard,
  Compass,
  Copy,
  Flame,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Music2,
  Search,
  Share2,
  Sparkles,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import CommunityDetailModal from './CommunityDetailModal';
import StudioHeader from '@/components/site/StudioHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORIES = [
  { id: 'all', label: '探索发现', icon: Compass },
  { id: 'image', label: 'AI 绘画', icon: ImageIcon },
  { id: 'video', label: 'AI 视频', icon: Clapperboard },
  { id: 'audio', label: 'AI 音乐', icon: Music2 },
  { id: 'workflow', label: '设计工作流', icon: Workflow },
];

const SORTS = [
  { id: 'trending', label: '热门趋势', icon: Flame },
  { id: 'newest', label: '最新发布', icon: Sparkles },
  { id: 'likes', label: '最多赞赏', icon: Heart },
];

function mediaMeta(type) {
  if (type === 'video') return { label: 'AI 视频', Icon: Clapperboard };
  if (type === 'audio') return { label: 'AI 音乐', Icon: AudioLines };
  if (type === 'workflow') return { label: '工作流', Icon: Workflow };
  return { label: 'AI 图像', Icon: ImageIcon };
}

function FeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-border/70 bg-card/60">
          <Skeleton className={`w-full rounded-none ${index % 3 === 0 ? 'h-72' : index % 3 === 1 ? 'h-56' : 'h-80'}`} />
          <div className="flex flex-col gap-3 p-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}

function PostCard({ post, onOpen, onLike, onRemix }) {
  const { label, Icon } = mediaMeta(post.media_type);
  const isVideo = post.media_type === 'video';
  const isAudio = post.media_type === 'audio';

  return (
    <Card className="group mb-4 break-inside-avoid overflow-hidden border-border/75 bg-card/65 py-0 shadow-none transition-all duration-page hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_70px_-30px_hsl(var(--primary)/0.55)]">
      <button type="button" className="block w-full text-left" onClick={() => onOpen(post.id)} aria-label={`打开作品：${post.title}`}>
        <div className="relative overflow-hidden bg-muted/40">
          {isVideo ? (
            <video src={post.cover_url || post.media_url} muted loop playsInline className="block max-h-[30rem] min-h-44 w-full object-cover transition duration-page group-hover:scale-[1.03]" />
          ) : isAudio ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/15 via-card to-accent/15 p-6 text-primary">
              <span className="flex size-16 items-center justify-center rounded-full border border-brand-line bg-brand-soft shadow-elevation-2"><AudioLines className="size-7" /></span>
              <span className="text-xs font-medium tracking-wide">音频创作</span>
            </div>
          ) : (
            <img src={post.cover_url || post.media_url} alt={post.title} loading="lazy" className="block max-h-[32rem] min-h-44 w-full object-cover transition duration-page group-hover:scale-[1.03]" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/85 to-transparent" />
          <Badge variant="secondary" className="absolute left-3 top-3 border border-line bg-background/75 text-foreground backdrop-blur-md"><Icon />{label}</Badge>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 opacity-0 transition-opacity duration-page group-hover:opacity-100">
            <span className="line-clamp-2 text-xs font-medium text-foreground">{post.title}</span>
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur"><MessageCircle />{post.comments_count || 0}</span>
          </div>
        </div>
      </button>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{post.title || '未命名作品'}</h3>
            <Link
              href={`/u/${post.author_user_number || post.user_id || ''}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 block truncate text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              {post.author_name || post.author_username || '社区创作者'}
            </Link>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="点赞" className={post.is_liked ? 'text-primary' : 'text-muted-foreground'} onClick={(event) => onLike(post, event)}>
            <Heart className={post.is_liked ? 'fill-current' : ''} />
            <span className="sr-only">{post.likes_count || 0} 个赞</span>
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>{post.likes_count || 0} 赞</span>
            <span>·</span>
            <span className="text-warning font-medium">🪙 {post.coins_count || 0} 币</span>
          </div>
          <Button type="button" variant="ghost" size="xs" className="text-primary hover:bg-primary/10" onClick={(event) => onRemix(post, event)}>
            <WandSparkles data-icon="inline-start" />做同款
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityClient({ initialPostId = null, locale: localeProp = null }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePostId, setActivePostId] = useState(initialPostId);
  const [toastMsg, setToastMsg] = useState('');
  const pathname = usePathname();
  const locale = resolveClientLocale({ explicit: localeProp, pathname });
  const isZh = locale.startsWith('zh');

  const triggerToast = (message) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(''), 2500);
  };

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '36', sort });
      if (category !== 'all') params.set('category', category);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const response = await fetch(`/api/community/posts?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (Array.isArray(data.posts)) setPosts(data.posts);
    } catch (error) {
      console.error('加载社区作品失败', error);
      triggerToast('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, sort]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleLike = async (post, event) => {
    event.stopPropagation();
    try {
      const response = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) return triggerToast(data.error || '请先登录');
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, is_liked: data.isLiked, likes_count: data.likesCount } : item));
    } catch { triggerToast('网络连接失败'); }
  };

  const handleRemix = (post, event) => {
    event.stopPropagation();
    fetch(`/api/community/posts/${post.id}/remix`, { method: 'POST' }).catch(() => {});
    const target = post.media_type === 'video' ? 'video' : post.media_type === 'audio' ? 'audio' : post.media_type === 'workflow' ? 'workflow' : 'image';
    const params = new URLSearchParams();
    if (post.prompt) params.set('remixPrompt', post.prompt);
    const studioRoot = isZh ? '/zh/studio' : '/studio';
    window.location.href = `${studioRoot}/${target}?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-base text-foreground flex flex-col selection:bg-wash-press">
      <StudioHeader action="creations" showBrand locale={locale} title={isZh ? '社区' : 'Community'} subtitle={isZh ? '发现灵感，复用创作方法' : 'Discover inspiration, remix creative workflows'} />
      {toastMsg && <div role="status" className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-primary/30 bg-popover/95 px-4 py-2 text-xs font-medium text-primary shadow-elevation-4 backdrop-blur-xl animate-float-in">{toastMsg}</div>}
      
      {/* 居中主内容区：严格对齐个人中心的 1360px 版心与自适应留白 */}
      <div className="flex-1 mx-auto w-full max-w-[1360px] px-6 sm:px-8 lg:px-12 py-8 sm:py-10 flex flex-col gap-8">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface/95 px-6 py-10 text-center shadow-elevation-3 backdrop-blur-md sm:px-12 sm:py-14">
          <div className="pointer-events-none absolute -left-16 -top-20 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-wash-press px-3 py-1 text-xs font-medium text-ink">
              <Sparkles className="size-3.5" />
              灵感社区
            </span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-ink sm:text-5xl">把灵感变成下一次创作</h1>
            <p className="mx-auto mt-4 max-w-2xl text-xs sm:text-sm leading-relaxed text-ink-muted font-normal">探索生图、视频、音乐与工作流作品，查看提示词和参数，带着方法直接开始。</p>
            <form onSubmit={(event) => { event.preventDefault(); loadPosts(); }} className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-xl border border-line bg-well p-1.5 shadow-inner transition focus-within:border-line-strong focus-within:ring-2 focus-within:ring-white/10">
              <Search className="ml-3 size-4 shrink-0 text-ink-muted" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索提示词、风格或模型" className="h-10 sm:h-11 flex-1 border-0 bg-transparent px-2 text-sm text-ink placeholder:text-ink-subtle" />
              <button type="submit" className="h-10 sm:h-11 rounded-lg bg-surface-inverse px-6 text-xs sm:text-sm font-semibold text-ink-on-accent shadow-elevation-2 transition-all hover:bg-white/90 active:scale-95">搜索</button>
            </form>
          </div>
        </section>

        {/* 分类过滤器与排序切换栏（对齐个人中心卡片药丸风格） */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line-subtle pb-5">
          <div className="inline-flex max-w-full overflow-x-auto items-center gap-1.5 p-1 rounded-xl bg-surface border border-line no-scrollbar">
            {CATEGORIES.map(({ id, label, icon: Icon }) => {
              const isSelected = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={`flex shrink-0 items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
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

          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface border border-line self-start sm:self-auto">
            {SORTS.map(({ id, label, icon: Icon }) => {
              const isSelected = sort === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-wash-press text-ink font-semibold shadow-elevation-1'
                      : 'text-ink-muted hover:text-ink hover:bg-wash'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 内容网格与大卡片空状态（对齐个人中心） */}
        <section className="flex-1 flex flex-col min-h-[420px]" aria-live="polite">
          {loading ? (
            <FeedSkeleton />
          ) : posts.length === 0 ? (
            <div className="flex-1 rounded-2xl border border-line-subtle bg-surface/80 backdrop-blur-sm p-12 sm:p-20 text-center flex flex-col items-center justify-center shadow-elevation-3">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-ink shadow-inner">
                <Compass className="size-6 text-ink" />
              </div>
              <h3 className="mt-5 text-base font-bold text-ink tracking-wide">还没有匹配的灵感</h3>
              <p className="mt-2 text-xs sm:text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
                换个关键词，或成为第一个在此频道发布创作成果的创作者。
              </p>
              <div className="mt-6">
                <Link
                  href="/creations"
                  className="inline-flex items-center gap-2 rounded-full bg-surface-inverse hover:bg-white/90 text-ink-on-accent px-6 py-2.5 text-xs sm:text-sm font-semibold shadow-elevation-2 transition-transform active:scale-95"
                >
                  <Share2 className="size-4" />
                  从我的作品分享
                </Link>
              </div>
            </div>
          ) : (
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onOpen={setActivePostId} onLike={handleLike} onRemix={handleRemix} />
              ))}
            </div>
          )}
        </section>
      </div>
      {activePostId && <CommunityDetailModal postId={activePostId} initialPost={posts.find((post) => post.id === activePostId)} onClose={() => setActivePostId(null)} onLikeChange={(id, liked, count) => setPosts((current) => current.map((post) => post.id === id ? { ...post, is_liked: liked, likes_count: count } : post))} />}
    </main>
  );
}
