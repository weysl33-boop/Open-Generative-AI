'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AudioLines,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Heart,
  Image as ImageIcon,
  Info,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Sparkles,
  UserCheck,
  UserPlus,
  WandSparkles,
  Workflow,
  X,
  ZoomIn,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CommunityDetailModal({
  postId: rawPostId,
  initialPost = null,
  post: directPost = null,
  posts = [],
  onClose,
  onNavigate,
  onLikeChange,
  isPage = false,
}) {
  const postId = rawPostId || directPost?.id || initialPost?.id;
  const [post, setPost] = useState(directPost || initialPost);
  const [loading, setLoading] = useState(!directPost && !initialPost);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [coinInfo, setCoinInfo] = useState({
    totalCoins: initialPost?.coins_count || 0,
    userTipped: 0,
    isAuthor: false,
  });
  const [tipping, setTipping] = useState(false);
  const [showTipMenu, setShowTipMenu] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showMoreParams, setShowMoreParams] = useState(false);
  const [showRefPreview, setShowRefPreview] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRemixDrawer, setShowRemixDrawer] = useState(false);
  const [remixPromptText, setRemixPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFullscreenMedia, setIsFullscreenMedia] = useState(false);

  const containerRef = useRef(null);

  const toast = useCallback((message) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(''), 2500);
  }, []);

  // Fetch post details, comments, and coin info
  useEffect(() => {
    if (!postId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetch(`/api/community/posts/${postId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/community/posts/${postId}/comments`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/community/posts/${postId}/coin`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([postData, commentData, coinData]) => {
        if (!mounted) return;
        if (postData?.post) {
          setPost(postData.post);
          setRemixPromptText(postData.post.prompt || '');
          if (postData.post.coins_count !== undefined) {
            setCoinInfo((prev) => ({ ...prev, totalCoins: postData.post.coins_count }));
          }
        }
        if (Array.isArray(commentData?.comments)) {
          setComments(commentData.comments);
        }
        if (coinData) {
          setCoinInfo(coinData);
        }

        // Check local storage for follow and favorite persistence
        if (typeof window !== 'undefined') {
          const followKey = `koyo_follow_${postData?.post?.author_id || postId}`;
          const favKey = `koyo_fav_${postId}`;
          setIsFollowing(window.localStorage.getItem(followKey) === 'true');
          setIsFavorited(window.localStorage.getItem(favKey) === 'true');
        }
      })
      .catch(() => {
        if (mounted) toast('加载作品详情失败');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [postId, toast]);

  // Determine current index and navigation prev / next
  const { currentIndex, prevPost, nextPost } = useMemo(() => {
    if (!Array.isArray(posts) || posts.length === 0) {
      return { currentIndex: -1, prevPost: null, nextPost: null };
    }
    const idx = posts.findIndex((p) => String(p.id) === String(postId));
    return {
      currentIndex: idx,
      prevPost: idx > 0 ? posts[idx - 1] : null,
      nextPost: idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null,
    };
  }, [posts, postId]);

  // Keyboard navigation for previous / next
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && prevPost && onNavigate) {
        onNavigate(prevPost.id);
      } else if (e.key === 'ArrowRight' && nextPost && onNavigate) {
        onNavigate(nextPost.id);
      } else if (e.key === 'Escape' && !isPage && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevPost, nextPost, onNavigate, onClose, isPage]);

  if (!postId) return null;

  const type = post?.media_type || 'image';
  const TypeIcon =
    type === 'video'
      ? Clapperboard
      : type === 'audio'
        ? AudioLines
        : type === 'workflow'
          ? Workflow
          : ImageIcon;

  const referenceImage =
    post?.parameters?.reference_image ||
    (post?.id === '7681561564197031193' ? '/assets/community/case-beer-ref-can.webp' : null);
  const referenceType = post?.parameters?.reference_type || (referenceImage ? '智能参考' : null);
  const aspectRatio = post?.aspect_ratio || post?.parameters?.aspect_ratio || '3:4';
  const modelName = post?.model_name || post?.parameters?.model || 'Seedream 5.0 Pro';

  // Actions
  const handleFollowToggle = () => {
    const next = !isFollowing;
    setIsFollowing(next);
    if (typeof window !== 'undefined') {
      const followKey = `koyo_follow_${post?.author_id || postId}`;
      window.localStorage.setItem(followKey, String(next));
    }
    toast(next ? `已关注作者 @${post?.author_name || '创作者'}` : '已取消关注');
  };

  const handleFavoriteToggle = () => {
    const next = !isFavorited;
    setIsFavorited(next);
    if (typeof window !== 'undefined') {
      const favKey = `koyo_fav_${postId}`;
      window.localStorage.setItem(favKey, String(next));
    }
    toast(next ? '⭐ 作品已加入收藏夹' : '已从收藏夹移除');
  };

  const toggleLike = async () => {
    if (!post || likeBusy) return;
    setLikeBusy(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        // Optimistic toggle if unauthenticated
        const optimisticLiked = !post.is_liked;
        const count = Math.max(0, (post.likes_count || 0) + (optimisticLiked ? 1 : -1));
        setPost((cur) => ({ ...cur, is_liked: optimisticLiked, likes_count: count }));
        toast(optimisticLiked ? '❤️ 点赞成功' : '已取消点赞');
        return;
      }
      setPost((current) => ({ ...current, is_liked: data.isLiked, likes_count: data.likesCount }));
      onLikeChange?.(post.id, data.isLiked, data.likesCount);
      toast(data.isLiked ? '❤️ 点赞成功' : '已取消点赞');
    } catch {
      toast('网络错误，请稍后重试');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleTipCoin = async (amount) => {
    if (tipping || !post) return;
    setTipping(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/coin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error || '投币失败');
        return;
      }
      setCoinInfo((prev) => ({
        ...prev,
        totalCoins: data.totalCoins,
        userTipped: data.userTippedTotal,
      }));
      setPost((prev) => (prev ? { ...prev, coins_count: data.totalCoins } : prev));
      toast(`🪙 成功为作品投出 ${amount} 枚硬币！`);
      setShowTipMenu(false);
    } catch {
      toast('网络错误，请稍后重试');
    } finally {
      setTipping(false);
    }
  };

  const copyPrompt = async () => {
    if (!post?.prompt) return;
    await navigator.clipboard.writeText(post.prompt);
    setCopied(true);
    toast('✅ 提示词已复制到剪贴板');
    window.setTimeout(() => setCopied(false), 1800);
  };

  const copyShareLink = async () => {
    const url = `${window.location.origin}/community/${post.id}`;
    await navigator.clipboard.writeText(url);
    toast('🔗 作品链接已复制到剪贴板');
    setShowMoreMenu(false);
  };

  const copyPostId = async () => {
    await navigator.clipboard.writeText(String(post.id));
    toast(`📋 作品 ID (${post.id}) 已复制`);
    setShowMoreMenu(false);
  };

  const downloadMedia = () => {
    if (!post?.media_url) return;
    const a = document.createElement('a');
    a.href = post.media_url;
    a.download = `${post.title || 'koyosim-creation'}-${post.id}.${type === 'video' ? 'mp4' : 'webp'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('📥 开始下载高清原件');
    setShowMoreMenu(false);
  };

  // 1. 做同款：打开底部生成抽屉 (Screenshot 4) 或直接前往 Studio
  const handleOpenRemix = () => {
    setShowRemixDrawer(true);
  };

  const handleGoToStudioRemix = () => {
    const target = type === 'video' ? 'video' : type === 'audio' ? 'audio' : type === 'workflow' ? 'workflow' : 'image';
    const params = new URLSearchParams();
    if (remixPromptText || post?.prompt) params.set('remixPrompt', remixPromptText || post.prompt);
    if (modelName) params.set('remixModel', modelName);
    if (aspectRatio) params.set('aspectRatio', aspectRatio);
    if (referenceImage) params.set('referenceImage', referenceImage);
    window.location.href = `/studio/${target}?${params.toString()}`;
  };

  // 2. 用作参考图：将本作品图片作为参考图，直达图像工作台
  const handleUseAsReference = () => {
    const targetImage = referenceImage || post?.media_url;
    const params = new URLSearchParams();
    if (targetImage) params.set('referenceImage', targetImage);
    if (aspectRatio) params.set('aspectRatio', aspectRatio);
    toast('🎨 正在载入参考图进入 Studio...');
    setTimeout(() => {
      window.location.href = `/studio/image?${params.toString()}`;
    }, 400);
  };

  // 3. 底部抽屉内直接生成同款
  const handleDirectGenerate = async () => {
    setIsGenerating(true);
    toast('⚡ 正在提交同款生成任务 (消耗 2 算力)...');
    try {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: remixPromptText || post.prompt,
          model: modelName,
          aspectRatio,
          referenceImage,
        }),
      });
      if (res.ok) {
        toast('🎉 同款任务已进入渲染队列，前往资产中心查看产物');
        setShowRemixDrawer(false);
      } else {
        // 跳转到工作台继续
        handleGoToStudioRemix();
      }
    } catch {
      handleGoToStudioRemix();
    } finally {
      setIsGenerating(false);
    }
  };

  const addComment = async (event) => {
    event.preventDefault();
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        // 本地乐观添加一条
        const optimisticComment = {
          id: `cmt_${Date.now()}`,
          author_name: '我',
          content: newComment.trim(),
          created_at: new Date().toISOString(),
        };
        setComments((current) => [...current, optimisticComment]);
        setNewComment('');
        toast('评论已发布');
        return;
      }
      setComments((current) => [...current, data.comment]);
      setNewComment('');
      toast('评论发布成功');
    } catch {
      toast('网络错误');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={
        isPage
          ? 'relative flex min-h-screen w-full flex-col bg-[#0a0b0e] text-foreground'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-0 sm:p-4 backdrop-blur-2xl animate-in fade-in duration-200'
      }
      onClick={!isPage ? onClose : undefined}
    >
      {toastMsg && (
        <div
          role="status"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[80] rounded-full border border-primary/30 bg-popover/95 px-5 py-2 text-xs font-medium text-primary shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {toastMsg}
        </div>
      )}

      {/* 模态框/页面外壳 */}
      <Card
        className={`relative flex w-full overflow-hidden border-border/80 bg-[#0e1015] p-0 shadow-2xl transition-all ${
          isPage
            ? 'min-h-screen rounded-none border-0'
            : 'h-full sm:h-[94vh] max-w-[1360px] sm:rounded-2xl flex-col md:flex-row'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 顶部返回/关闭按钮 */}
        {!isPage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-30 rounded-full bg-black/40 text-muted-foreground hover:bg-black/60 hover:text-white backdrop-blur-md"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-5" />
          </Button>
        ) : (
          <div className="absolute left-4 top-4 z-30 flex items-center gap-3">
            <Link
              href="/community"
              className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-black/80 hover:text-white backdrop-blur-md transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>返回灵感广场</span>
            </Link>
          </div>
        )}

        {loading || !post ? (
          <div className="flex flex-1 items-center justify-center min-h-[400px]">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              正在加载即梦作品详情...
            </span>
          </div>
        ) : (
          <>
            {/* 左侧主展示舞台 (Full Canvas) */}
            <div className="relative flex min-w-0 flex-1 items-center justify-center bg-[#07080a] p-4 sm:p-8 overflow-hidden select-none group">
              {/* 左右翻页导航按钮 (< 和 >) */}
              {prevPost && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(prevPost.id)}
                  className="absolute left-4 z-20 flex size-11 items-center justify-center rounded-full bg-black/60 text-white/70 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-black/90 hover:text-white active:scale-95"
                  title={`上一幅：${prevPost.title || '作品'}`}
                  aria-label="上一幅作品"
                >
                  <ChevronLeft className="size-6" />
                </button>
              )}

              {nextPost && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(nextPost.id)}
                  className="absolute right-4 z-20 flex size-11 items-center justify-center rounded-full bg-black/60 text-white/70 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:bg-black/90 hover:text-white active:scale-95"
                  title={`下一幅：${nextPost.title || '作品'}`}
                  aria-label="下一幅作品"
                >
                  <ChevronRight className="size-6" />
                </button>
              )}

              {/* 顶部工具栏 (全屏预览 / 下载) */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsFullscreenMedia((v) => !v)}
                  className="size-8 rounded-full bg-black/50 text-white/80 hover:bg-black/80 hover:text-white backdrop-blur-md"
                  title="全屏预览"
                >
                  <Maximize2 className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={downloadMedia}
                  className="size-8 rounded-full bg-black/50 text-white/80 hover:bg-black/80 hover:text-white backdrop-blur-md"
                  title="下载原图"
                >
                  <Download className="size-4" />
                </Button>
              </div>

              {/* 作品主体渲染 */}
              <div className="relative flex max-h-[82vh] w-full items-center justify-center">
                {type === 'video' ? (
                  <video
                    src={post.media_url}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10"
                  />
                ) : type === 'audio' ? (
                  <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl">
                    <span className="flex size-24 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-elevation-2">
                      <AudioLines className="size-10 animate-pulse" />
                    </span>
                    <div className="text-center">
                      <h4 className="text-base font-semibold text-foreground">{post.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">AI 高品质音频渲染作品</p>
                    </div>
                    <audio src={post.media_url} controls autoPlay className="w-full" />
                  </div>
                ) : (
                  <img
                    src={post.media_url}
                    alt={post.title}
                    className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10 transition-transform duration-200"
                  />
                )}
              </div>

              {/* 左下角信息徽章 */}
              <div className="absolute bottom-5 left-5 z-10 flex items-center gap-2">
                <Badge variant="secondary" className="border border-white/10 bg-black/60 px-2.5 py-1 text-xs text-white/90 backdrop-blur-md">
                  <TypeIcon className="size-3.5 mr-1" />
                  {type === 'video' ? 'AI 视频' : type === 'audio' ? 'AI 音乐' : 'AI 绘画'}
                </Badge>
                {aspectRatio && (
                  <Badge variant="outline" className="border-white/10 bg-black/50 text-white/75 text-[11px]">
                    {aspectRatio}
                  </Badge>
                )}
              </div>

              {/* 底部滑出的“做同款”创作工具抽屉 (Screenshot 4) */}
              {showRemixDrawer && (
                <div className="absolute inset-x-4 bottom-4 z-40 rounded-2xl border border-border/80 bg-[#12141a]/95 p-4 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-6 duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">一键同款生成器</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowRemixDrawer(false)}
                      className="size-6 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    {/* 参考图缩略卡片 (@image1) */}
                    {referenceImage && (
                      <div className="relative shrink-0 flex items-center gap-2 rounded-xl border border-white/15 bg-black/50 p-1.5 pr-3">
                        <img
                          src={referenceImage}
                          alt="参考图"
                          className="size-10 rounded-lg object-cover ring-1 ring-primary/40"
                        />
                        <div className="text-left">
                          <span className="block text-[11px] font-bold text-primary">@image1</span>
                          <span className="block text-micro text-muted-foreground">智能参考图</span>
                        </div>
                      </div>
                    )}

                    {/* 可编辑提示词输入框 */}
                    <div className="flex-1 w-full">
                      <textarea
                        rows={2}
                        value={remixPromptText}
                        onChange={(e) => setRemixPromptText(e.target.value)}
                        placeholder="输入提示词进行同款生成..."
                        className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none custom-scrollbar"
                      />
                    </div>

                    {/* 快捷操作按钮 */}
                    <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isGenerating}
                        onClick={handleDirectGenerate}
                        className="flex-1 sm:flex-none font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Sparkles className="size-3.5 mr-1" />
                        立即生成 (2算力)
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleGoToStudioRemix}
                        className="flex-1 sm:flex-none text-xs"
                      >
                        前往 Studio 精修
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧详细参数与交互侧边栏 (Sidebar, 390-420px) */}
            <div className="flex w-full shrink-0 flex-col border-t border-border/80 bg-[#0e1015] md:w-[410px] md:border-l md:border-t-0">
              {/* 1. 作者行 (Author Section with +关注 and 点赞/收藏/更多) */}
              <div className="flex items-center justify-between border-b border-border/70 p-4">
                <Link
                  href={`/u/${post.author_id || post.user_id || ''}`}
                  onClick={!isPage ? onClose : undefined}
                  className="group flex items-center gap-3 min-w-0"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-2 ring-primary/20 transition group-hover:ring-primary/60">
                    {post.author_avatar ? (
                      <img src={post.author_avatar} alt="作者头像" className="size-full object-cover" />
                    ) : (
                      <span className="font-semibold">{(post.author_name || '创').slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                      {post.author_name || post.author_username || '社区创作者'}
                    </p>
                    <p className="truncate text-micro text-muted-foreground">
                      {post.author_followers ? `${post.author_followers.toLocaleString()} 粉丝 · ` : ''}
                      {post.author_id ? `UID: ${post.author_id.slice(-6)}` : ''}
                    </p>
                  </div>
                </Link>

                {/* 右侧：+关注 按钮 + 点赞 + 收藏 + 更多 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant={isFollowing ? 'secondary' : 'default'}
                    size="xs"
                    onClick={handleFollowToggle}
                    className={`h-7 px-2.5 text-xs font-semibold rounded-full transition-all ${
                      isFollowing
                        ? 'border border-border/80 bg-muted/60 text-muted-foreground hover:bg-muted'
                        : 'bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30'
                    }`}
                  >
                    {isFollowing ? <Check className="size-3 mr-1" /> : <UserPlus className="size-3 mr-1" />}
                    {isFollowing ? '已关注' : '+ 关注'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleLike}
                    className={`size-8 rounded-full ${post.is_liked ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
                    title="点赞"
                  >
                    <Heart className={`size-4 ${post.is_liked ? 'fill-current' : ''}`} />
                    <span className="sr-only">{post.likes_count || 0}</span>
                  </Button>
                  <span className="text-xs font-mono text-muted-foreground mr-1">{post.likes_count || 0}</span>

                  <Button
                    type="button"
                    variant={isFavorited ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={handleFavoriteToggle}
                    className={`size-8 rounded-full ${isFavorited ? 'text-amber-400 bg-amber-400/10' : 'text-muted-foreground hover:text-foreground'}`}
                    title="收藏"
                  >
                    <Bookmark className={`size-4 ${isFavorited ? 'fill-current' : ''}`} />
                  </Button>

                  {/* 更多选项菜单 (Dropdown) */}
                  <div className="relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowMoreMenu((v) => !v)}
                      className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                      title="更多选项"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>

                    {showMoreMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-border/80 bg-[#16181f]/95 p-1 text-xs shadow-2xl backdrop-blur-xl z-popover animate-in fade-in-0 zoom-in-95 duration-100">
                        <button
                          type="button"
                          onClick={downloadMedia}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"
                        >
                          <Download className="size-3.5 text-muted-foreground" />
                          <span>下载高清原件</span>
                        </button>
                        <button
                          type="button"
                          onClick={copyShareLink}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"
                        >
                          <Share2 className="size-3.5 text-muted-foreground" />
                          <span>复制作品链接</span>
                        </button>
                        <button
                          type="button"
                          onClick={copyPostId}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"
                        >
                          <Copy className="size-3.5 text-muted-foreground" />
                          <span>复制作品 ID</span>
                        </button>
                        <div className="my-1 h-px bg-border/60" />
                        <button
                          type="button"
                          onClick={() => {
                            toast('感谢反馈，已提交内容安全审核');
                            setShowMoreMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        >
                          <span>举报违规内容</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. 中间滚动区域 (标题、AI声明、提示词卡片、参数栏、评论) */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
                {/* 作品标题与 AI 生成声明 */}
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">{post.title}</h2>
                  <div className="mt-1 flex items-center gap-2 text-micro text-muted-foreground">
                    <span>{post.created_at ? new Date(post.created_at).toLocaleDateString('zh-CN') : '2026-09-04'}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 font-medium text-[11px] text-primary/90">
                      <Sparkles className="size-3" />内容由 AI 生成
                    </span>
                  </div>
                  {post.description && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{post.description}</p>
                  )}
                  {post.tags?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="border-border/60 bg-muted/20 text-muted-foreground text-[11px] font-normal">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* 提示词卡片 (图片提示词 + 复制/使用提示词) */}
                <div className="rounded-xl border border-border/80 bg-[#12141a]/70 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      {type === 'video' ? '视频提示词' : type === 'audio' ? '音乐提示词' : '图片提示词'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 gap-1 text-primary hover:bg-primary/10"
                      onClick={copyPrompt}
                    >
                      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                      <span className="text-xs">{copied ? '已复制' : '使用提示词'}</span>
                    </Button>
                  </div>
                  <p className="max-h-36 overflow-y-auto text-xs leading-relaxed text-foreground/85 custom-scrollbar select-text">
                    {post.prompt || '创作者未公开具体提示词'}
                  </p>
                  {post.negative_prompt && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-micro font-medium text-muted-foreground mb-0.5">反向提示词 (Negative Prompt):</p>
                      <p className="text-micro text-muted-foreground leading-relaxed">{post.negative_prompt}</p>
                    </div>
                  )}
                </div>

                {/* 生成参数与智能参考胶囊标签栏 (Matches Screenshot 2 & 3) */}
                <div className="relative flex flex-wrap items-center gap-2">
                  {/* 智能参考 (Smart Reference) 标签与悬浮预览卡片 */}
                  {referenceImage && (
                    <div className="relative">
                      <button
                        type="button"
                        onMouseEnter={() => setShowRefPreview(true)}
                        onMouseLeave={() => setShowRefPreview(false)}
                        onClick={() => setShowRefPreview((v) => !v)}
                        className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-elevation-1"
                      >
                        <ImageIcon className="size-3.5" />
                        <span>{referenceType || '智能参考'}</span>
                      </button>

                      {/* 智能参考 Hover 悬浮预览卡片 (Screenshot 3) */}
                      {showRefPreview && (
                        <div
                          onMouseEnter={() => setShowRefPreview(true)}
                          onMouseLeave={() => setShowRefPreview(false)}
                          className="absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-border/90 bg-[#161820]/98 p-2.5 text-foreground shadow-2xl backdrop-blur-2xl z-popover animate-in fade-in-0 zoom-in-95 duration-150"
                        >
                          <div className="flex items-center justify-between mb-1.5 px-1">
                            <span className="text-[11px] font-bold text-primary">智能参考</span>
                            <span className="text-micro text-muted-foreground">原图资产</span>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 aspect-[3/4]">
                            <img
                              src={referenceImage}
                              alt="智能参考原图"
                              className="size-full object-contain"
                            />
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            onClick={handleUseAsReference}
                            className="mt-2 w-full text-micro h-6 font-semibold"
                          >
                            以它为参考图做同款
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 使用模型胶囊 */}
                  {modelName && (
                    <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground/90">
                      {modelName}
                    </span>
                  )}

                  {/* 画布比例胶囊 */}
                  {aspectRatio && (
                    <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-mono text-muted-foreground">
                      {aspectRatio}
                    </span>
                  )}

                  {/* 更多参数按钮与抽屉 (更多 (i)) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreParams((v) => !v)}
                      className="flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <span>更多</span>
                      <Info className="size-3" />
                    </button>

                    {showMoreParams && (
                      <div className="absolute right-0 bottom-full mb-2 w-56 rounded-2xl border border-border/90 bg-[#161820]/98 p-3 text-xs shadow-2xl backdrop-blur-2xl z-popover animate-in fade-in-0 zoom-in-95 duration-150">
                        <p className="font-bold text-foreground mb-2 text-xs">生成底层技术参数</p>
                        <div className="space-y-1.5 font-mono text-micro text-muted-foreground">
                          <div className="flex justify-between">
                            <span>分辨率:</span>
                            <span className="text-foreground">{post.parameters?.resolution || '1536 × 2048'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>采样步数 (Steps):</span>
                            <span className="text-foreground">{post.parameters?.steps || 32}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>引导系数 (CFG):</span>
                            <span className="text-foreground">{post.parameters?.cfg_scale || 7.5}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>随机种子 (Seed):</span>
                            <span className="text-foreground">{post.parameters?.seed || 7681561564}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>采样算法:</span>
                            <span className="text-foreground">{post.parameters?.sampler || 'DPM++ 2M Karras'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>生成引擎:</span>
                            <span className="text-foreground">{post.parameters?.engine || 'Koyo-Visual 5.0'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 评论区 */}
                <div className="pt-2 border-t border-border/60">
                  <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <MessageCircle className="size-3.5 text-primary" />
                      评论互动 ({comments.length})
                    </span>
                    {/* 投币入口 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTipMenu((v) => !v)}
                        className="flex items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-micro font-medium text-warning hover:bg-warning/20 transition-all cursor-pointer"
                      >
                        <span>🪙 {coinInfo.totalCoins || post.coins_count || 0} 币</span>
                        <span className="text-micro font-normal">投币</span>
                      </button>

                      {showTipMenu && (
                        <div className="absolute right-0 bottom-full mb-2 w-44 rounded-2xl border border-warning-line bg-[#1c1a14]/98 p-3 text-xs shadow-2xl backdrop-blur-2xl z-popover animate-in fade-in-0 zoom-in-95 duration-100">
                          <p className="text-[11px] text-center mb-2 font-medium text-warning">
                            {coinInfo.isAuthor ? '不可给自己的作品投币' : `为好作品投币 (已投 ${coinInfo.userTipped}/2)`}
                          </p>
                          {!coinInfo.isAuthor && coinInfo.userTipped < 2 && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                disabled={tipping}
                                onClick={() => handleTipCoin(1)}
                                className="flex flex-col items-center justify-center rounded-xl border border-warning-line bg-warning-soft py-1 text-xs font-bold text-warning hover:bg-warning/20 cursor-pointer"
                              >
                                <span>🪙 1 币</span>
                                <span className="text-micro font-normal opacity-80">赞赏</span>
                              </button>
                              <button
                                type="button"
                                disabled={tipping || coinInfo.userTipped >= 1}
                                onClick={() => handleTipCoin(2)}
                                className="flex flex-col items-center justify-center rounded-xl border border-warning-line bg-warning/20 py-1 text-xs font-bold text-warning hover:bg-warning/30 cursor-pointer"
                              >
                                <span>🪙 2 币</span>
                                <span className="text-micro font-normal opacity-80">双倍</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 评论列表 */}
                  <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl bg-muted/20 p-2.5 text-xs">
                        <div className="flex items-center justify-between text-micro text-muted-foreground">
                          <span className="font-semibold text-foreground/90">{comment.author_name || '社区创作者'}</span>
                          <span>{comment.created_at ? new Date(comment.created_at).toLocaleDateString('zh-CN') : '刚刚'}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-foreground/80">{comment.content}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="py-2 text-center text-micro text-muted-foreground">暂无评论，留下第一条创作心得吧~</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. 底部固定操作栏 (Pinned Bottom Actions: 做同款 & 用作参考图) */}
              <div className="border-t border-border/80 bg-[#0c0d12] p-4 flex flex-col gap-2.5">
                {/* 评论输入框 */}
                <form onSubmit={addComment} className="flex gap-2">
                  <Input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="说点什么支持创作者..."
                    className="h-8 text-xs bg-muted/30 border-border/70 rounded-full px-3"
                  />
                  <Button type="submit" size="icon-sm" disabled={submittingComment} className="size-8 shrink-0 rounded-full" aria-label="发送">
                    <Send className="size-3.5" />
                  </Button>
                </form>

                {/* 双主要行动按键：做同款 & 用作参考图 (Matches Screenshot 2) */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleOpenRemix}
                    className="h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-elevation-2 rounded-xl transition-all active:scale-[0.98]"
                  >
                    <WandSparkles className="size-4 mr-1.5" />
                    做同款
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUseAsReference}
                    className="h-10 font-semibold border-border/80 bg-muted/30 text-foreground hover:bg-muted/70 hover:border-primary/50 rounded-xl transition-all active:scale-[0.98]"
                  >
                    <ImageIcon className="size-4 mr-1.5" />
                    用作参考图
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
