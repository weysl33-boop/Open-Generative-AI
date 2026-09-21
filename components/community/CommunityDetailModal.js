'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AudioLines, Check, Clapperboard, Copy, Heart, Image as ImageIcon, MessageCircle, Send, Share2, WandSparkles, Workflow, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CommunityDetailModal({ postId, initialPost = null, onClose, onLikeChange }) {
  const [post, setPost] = useState(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [coinInfo, setCoinInfo] = useState({ totalCoins: initialPost?.coins_count || 0, userTipped: 0, isAuthor: false });
  const [tipping, setTipping] = useState(false);
  const [showTipMenu, setShowTipMenu] = useState(false);

  const toast = (message) => { setToastMsg(message); window.setTimeout(() => setToastMsg(''), 2300); };

  useEffect(() => {
    if (!postId) return;
    let mounted = true;
    Promise.all([
      fetch(`/api/community/posts/${postId}`),
      fetch(`/api/community/posts/${postId}/comments`),
      fetch(`/api/community/posts/${postId}/coin`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(async ([postResponse, commentsResponse, coinData]) => {
      const postData = await postResponse.json();
      const commentData = await commentsResponse.json();
      if (mounted) {
        if (postData.post) setPost(postData.post);
        if (Array.isArray(commentData.comments)) setComments(commentData.comments);
        if (coinData) setCoinInfo(coinData);
      }
    }).catch(() => toast('加载详情失败')).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [postId]);

  if (!postId) return null;
  const type = post?.media_type || 'image';
  const TypeIcon = type === 'video' ? Clapperboard : type === 'audio' ? AudioLines : type === 'workflow' ? Workflow : ImageIcon;

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
      setPost((prev) => prev ? { ...prev, coins_count: data.totalCoins } : prev);
      toast(`🪙 成功为作品投出 ${amount} 枚 K 币！`);
      setShowTipMenu(false);
    } catch {
      toast('网络错误，请稍后重试');
    } finally {
      setTipping(false);
    }
  };
  const toggleLike = async () => { if (!post || likeBusy) return; setLikeBusy(true); try { const response = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' }); const data = await response.json(); if (!response.ok) return toast(data.error || '请先登录后再点赞'); setPost((current) => ({ ...current, is_liked: data.isLiked, likes_count: data.likesCount })); onLikeChange?.(post.id, data.isLiked, data.likesCount); } catch { toast('网络错误，请稍后重试'); } finally { setLikeBusy(false); } };
  const remix = () => { const target = type === 'video' ? 'video' : type === 'audio' ? 'audio' : type === 'workflow' ? 'workflow' : 'image'; const params = new URLSearchParams(); if (post?.prompt) params.set('remixPrompt', post.prompt); if (post?.model_name) params.set('remixModel', post.model_name); window.location.href = `/studio/${target}?${params.toString()}`; };
  const copyPrompt = async () => { if (!post?.prompt) return; await navigator.clipboard.writeText(post.prompt); setCopied(true); toast('提示词已复制'); window.setTimeout(() => setCopied(false), 1600); };
  const share = async () => { await navigator.clipboard.writeText(`${window.location.origin}/community/${post.id}`); toast('分享链接已复制'); };
  const addComment = async (event) => { event.preventDefault(); if (!newComment.trim() || submittingComment) return; setSubmittingComment(true); try { const response = await fetch(`/api/community/posts/${post.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newComment.trim() }) }); const data = await response.json(); if (!response.ok) return toast(data.error || '评论失败，请先登录'); setComments((current) => [...current, data.comment]); setNewComment(''); toast('评论发布成功'); } catch { toast('网络错误'); } finally { setSubmittingComment(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-3 backdrop-blur-xl" onClick={onClose}>
      {toastMsg && (
        <div role="status" className="fixed top-6 z-[60] rounded-full border border-primary/30 bg-popover px-4 py-2 text-xs text-primary shadow-elevation-3">
          {toastMsg}
        </div>
      )}
      <Card className="relative flex h-[92vh] w-full max-w-6xl overflow-hidden border-border bg-card py-0 shadow-elevation-4 md:flex-row" onClick={(event) => event.stopPropagation()}>
        <Button type="button" variant="secondary" size="icon" className="absolute right-4 top-4 z-10" onClick={onClose} aria-label="关闭">
          <X />
        </Button>
        {loading || !post ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              正在加载作品详情
            </span>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center justify-center bg-background p-6">
              {type === 'video' ? (
                <video src={post.media_url} controls autoPlay loop className="max-h-full max-w-full rounded-xl object-contain" />
              ) : type === 'audio' ? (
                <div className="flex w-full max-w-sm flex-col items-center gap-6">
                  <span className="flex size-28 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-brand shadow-elevation-2">
                    <AudioLines className="size-10" />
                  </span>
                  <audio src={post.media_url} controls autoPlay className="w-full" />
                </div>
              ) : (
                <img src={post.media_url} alt={post.title} className="max-h-full max-w-full rounded-xl object-contain" />
              )}
              <Badge variant="secondary" className="absolute bottom-5 left-5 border border-border bg-card/80 backdrop-blur">
                <TypeIcon />{type === 'video' ? 'AI 视频' : type === 'audio' ? 'AI 音乐' : 'AI 图像'}
              </Badge>
            </div>
            <div className="flex w-full shrink-0 flex-col border-t border-border md:w-[390px] md:border-l md:border-t-0">
              <div className="border-b border-border p-5">
                <Link
                  href={`/u/${post.author_user_number || post.user_id || ''}`}
                  onClick={onClose}
                  className="group flex items-center gap-3 transition-opacity hover:opacity-90"
                >
                  <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-2 ring-transparent transition group-hover:ring-primary/40">
                    {post.author_avatar ? (
                      <img src={post.author_avatar} alt="作者头像" className="size-full object-cover" />
                    ) : (
                      <span>{(post.author_name || '创').slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                      {post.author_name || post.author_username || '社区创作者'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {post.author_user_number ? `UID: ${post.author_user_number} · ` : ''}
                      {post.created_at ? new Date(post.created_at).toLocaleDateString('zh-CN') : '刚刚发布'}
                    </p>
                  </div>
                </Link>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-5 custom-scrollbar">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">{post.title}</h2>
                  {post.description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{post.description}</p>}
                  {post.tags?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="border-primary/25 text-primary">#{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">提示词 Prompt</p>
                    <Button type="button" variant="ghost" size="xs" className="text-primary" onClick={copyPrompt}>
                      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                  <p className="max-h-40 overflow-y-auto text-sm leading-6 text-foreground/85 custom-scrollbar">{post.prompt || '未提供提示词'}</p>
                </div>
                {post.model_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">使用模型</p>
                    <p className="mt-1 font-mono text-sm text-primary">{post.model_name}</p>
                  </div>
                )}
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <MessageCircle />评论 <span className="text-muted-foreground">{comments.length}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl bg-muted/45 p-3">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/u/${comment.author_user_number || comment.user_id || ''}`}
                            onClick={onClose}
                            className="text-xs font-medium text-foreground transition-colors hover:text-primary"
                          >
                            {comment.author_name || '社区用户'}
                          </Link>
                          {comment.created_at && (
                            <span className="text-micro text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString('zh-CN')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{comment.content}</p>
                      </div>
                    ))}
                    {comments.length === 0 && <p className="text-xs text-muted-foreground">还没有评论，来留下第一句反馈。</p>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border p-5">
                <form onSubmit={addComment} className="flex gap-2">
                  <Input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="写一句评论" />
                  <Button type="submit" size="icon" disabled={submittingComment} aria-label="发布评论">
                    <Send />
                  </Button>
                </form>
                <div className="grid grid-cols-4 gap-2">
                  <Button type="button" variant={post.is_liked ? 'default' : 'outline'} onClick={toggleLike} className="px-2">
                    <Heart className={post.is_liked ? 'fill-current' : ''} data-icon="inline-start" />{post.likes_count || 0}
                  </Button>

                  {/* 🪙 投币交互按钮 (支持投 1 或 2 币) */}
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className={`w-full px-2 border-warning-line text-warning hover:border-warning hover:bg-warning-soft ${
                        coinInfo.userTipped >= 2 ? 'border-warning-line bg-warning-soft font-bold shadow-elevation-1' : ''
                      }`}
                      onClick={() => setShowTipMenu((v) => !v)}
                      title={coinInfo.isAuthor ? '不能给自己的作品投币' : `已投 ${coinInfo.userTipped}/2 币`}
                    >
                      <span className="text-xs mr-0.5">🪙</span>
                      <span className="text-xs font-mono">{coinInfo.totalCoins || post.coins_count || 0}</span>
                    </Button>

                    {/* 投币气泡选择菜单 */}
                    {showTipMenu && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-2xl border border-warning-line bg-well/95 p-3 text-ink shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-popover animate-in fade-in-0 zoom-in-95 duration-fast">
                        <div className="text-[11px] text-ink text-center mb-2 font-medium">
                          {coinInfo.isAuthor ? (
                            '不可给自己的作品投币'
                          ) : coinInfo.userTipped >= 2 ? (
                            <span className="text-warning font-bold">已为该作品投满 2 币</span>
                          ) : (
                            <>给作品投币 (已投 <span className="text-warning font-bold">{coinInfo.userTipped}/2</span>)</>
                          )}
                        </div>
                        {!coinInfo.isAuthor && coinInfo.userTipped < 2 && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              disabled={tipping}
                              onClick={() => handleTipCoin(1)}
                              className="flex flex-col items-center justify-center rounded-xl border border-warning-line bg-warning-soft py-1.5 text-xs font-bold text-warning hover:bg-warning-soft active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                            >
                              <span>🪙 1 币</span>
                              <span className="text-micro text-warning font-normal">心意支持</span>
                            </button>
                            <button
                              type="button"
                              disabled={tipping || coinInfo.userTipped >= 1}
                              onClick={() => handleTipCoin(2)}
                              className="flex flex-col items-center justify-center rounded-xl border border-warning-line bg-gradient-to-b from-warning-soft to-yellow-500/15 py-1.5 text-xs font-black text-warning hover:from-warning-soft active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-elevation-1"
                            >
                              <span>🪙 2 币</span>
                              <span className="text-micro text-warning font-normal">双倍力挺</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Button type="button" variant="outline" onClick={share} className="px-2">
                    <Share2 data-icon="inline-start" />分享
                  </Button>
                  <Button type="button" variant="outline" onClick={remix} className="px-2">
                    <WandSparkles data-icon="inline-start" />同款
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
