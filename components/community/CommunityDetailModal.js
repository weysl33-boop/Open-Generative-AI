'use client';

import { useState, useEffect } from 'react';

export default function CommunityDetailModal({ postId, initialPost = null, onClose, onLikeChange }) {
  const [post, setPost] = useState(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  useEffect(() => {
    if (!postId) return;

    let isMounted = true;
    const loadDetail = async () => {
      try {
        const [postRes, commentRes] = await Promise.all([
          fetch(`/api/community/posts/${postId}`),
          fetch(`/api/community/posts/${postId}/comments`),
        ]);

        const postData = await postRes.json();
        const commentData = await commentRes.json();

        if (isMounted) {
          if (postData.post) setPost(postData.post);
          if (Array.isArray(commentData.comments)) setComments(commentData.comments);
        }
      } catch (e) {
        console.error('加载作品详情异常', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDetail();
    return () => { isMounted = false; };
  }, [postId]);

  const handleToggleLike = async () => {
    if (!post || likeBusy) return;
    setLikeBusy(true);

    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setPost((prev) => ({
          ...prev,
          is_liked: data.isLiked,
          likes_count: data.likesCount,
        }));
        if (onLikeChange) onLikeChange(post.id, data.isLiked, data.likesCount);
      } else {
        triggerToast(data.error || '请先登录后再点赞');
      }
    } catch {
      triggerToast('网络错误，请稍后重试');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleRemix = async () => {
    if (!post) return;
    try {
      fetch(`/api/community/posts/${post.id}/remix`, { method: 'POST' }).catch(() => {});
    } catch {}

    const mediaType = post.media_type || 'image';
    let targetStudio = 'image';
    if (mediaType === 'video') targetStudio = 'video';
    else if (mediaType === 'audio') targetStudio = 'audio';
    else if (mediaType === 'workflow') targetStudio = 'workflow';

    const prompt = post.prompt || '';
    const model = post.model_name || '';
    const params = post.parameters || {};

    const queryParams = new URLSearchParams();
    if (prompt) queryParams.set('remixPrompt', prompt);
    if (model) queryParams.set('remixModel', model);
    if (params.aspectRatio) queryParams.set('remixAr', params.aspectRatio);

    window.location.href = `/studio/${targetStudio}?${queryParams.toString()}`;
  };

  const handleCopyPrompt = () => {
    if (!post?.prompt) return;
    navigator.clipboard.writeText(post.prompt);
    setCopied(true);
    triggerToast('✨ 提示词已完整复制！');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/community/${post.id}`;
    navigator.clipboard.writeText(url);
    triggerToast('🔗 作品公开分享链接已复制！');
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);

    try {
      const res = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data.comment]);
        setPost((prev) => ({ ...prev, comments_count: (prev.comments_count || 0) + 1 }));
        setNewComment('');
        triggerToast('评论发布成功！');
      } else {
        triggerToast(data.error || '评论失败，请先登录');
      }
    } catch {
      triggerToast('网络错误');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (!postId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-2 sm:p-4 md:p-6 animate-fade-in"
      onClick={onClose}
    >
      {/* Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full border border-cyan-400/40 bg-[#121820]/95 px-5 py-2.5 text-xs font-semibold text-cyan-300 shadow-2xl backdrop-blur-xl">
          {toastMsg}
        </div>
      )}

      <div
        className="relative w-full max-w-6xl h-[92vh] rounded-3xl border border-white/10 bg-[#0d0f13] text-white shadow-2xl overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 hover:bg-white/20 hover:text-white transition backdrop-blur-md"
        >
          ✕
        </button>

        {loading || !post ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* 左侧：画幅展示区（即梦沉浸视窗） */}
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden p-4 sm:p-6">
              {post.media_type === 'video' ? (
                <video
                  src={post.media_url}
                  controls
                  autoPlay
                  loop
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                />
              ) : post.media_type === 'audio' ? (
                <div className="flex flex-col items-center justify-center gap-6 p-8 text-center max-w-md w-full">
                  <div className="relative h-40 w-40 rounded-full bg-gradient-to-tr from-cyan-500/30 to-purple-600/30 p-2 shadow-2xl animate-spin-slow">
                    <div className="h-full w-full rounded-full bg-[#12141a] border border-cyan-400/30 flex items-center justify-center text-5xl">
                      🎵
                    </div>
                  </div>
                  <div className="w-full">
                    <h3 className="text-base font-bold text-white mb-2">{post.title}</h3>
                    <audio src={post.media_url} controls autoPlay className="w-full" />
                  </div>
                </div>
              ) : (
                <img
                  src={post.media_url}
                  alt={post.title}
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl select-none"
                />
              )}

              {/* 媒体左下角画幅指示 */}
              <div className="absolute bottom-6 left-6 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white/70 border border-white/10">
                {post.media_type === 'video' ? '🎬 AI 视频' : post.media_type === 'audio' ? '🎵 AI 音乐' : '🖼️ AI 生图'}
              </div>
            </div>

            {/* 右侧：参数面板、作者与一键同款交互 */}
            <div className="w-full md:w-[420px] flex-shrink-0 border-t md:border-t-0 md:border-l border-white/10 bg-[#111317] flex flex-col h-full overflow-hidden">
              {/* 顶部作者栏 */}
              <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-500 p-0.5 shadow-md">
                    <div className="h-full w-full rounded-full bg-[#111317] flex items-center justify-center overflow-hidden">
                      {post.author_avatar ? (
                        <img src={post.author_avatar} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg">✨</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      {post.author_name || post.author_username || 'AI 探索家'}
                    </h4>
                    <p className="text-[11px] text-white/40">
                      发布于 {new Date(post.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShareLink}
                    className="rounded-full bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white transition"
                    title="复制分享链接"
                  >
                    🔗
                  </button>
                </div>
              </div>

              {/* 中部可滚动内容：标题、提示词、参数、评论 */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{post.title}</h2>
                  {post.description && (
                    <p className="mt-1.5 text-xs text-white/60 leading-relaxed">{post.description}</p>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 text-[11px] text-cyan-300 font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 核心提示词与一键复制 */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Prompt 提示词</span>
                    <button
                      onClick={handleCopyPrompt}
                      className="text-xs font-medium text-cyan-300 hover:text-cyan-200 transition flex items-center gap-1"
                    >
                      {copied ? '✓ 已复制' : '📋 复制词'}
                    </button>
                  </div>
                  <p className="text-xs text-white/90 leading-relaxed select-all">
                    {post.prompt || '创作者未公开文字提示词'}
                  </p>
                </div>

                {/* 模型与参数面板 */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                    <span className="text-[11px] text-white/40 block">生成模型</span>
                    <span className="font-mono text-cyan-300 font-semibold truncate block mt-0.5">
                      {post.model_name || 'Generative Model'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                    <span className="text-[11px] text-white/40 block">同款热度</span>
                    <span className="font-mono text-purple-300 font-semibold block mt-0.5">
                      🔥 {post.remix_count || 0} 次使用
                    </span>
                  </div>
                </div>

                {/* 评论区 */}
                <div className="pt-3 border-t border-white/[0.08]">
                  <h4 className="text-xs font-bold text-white/70 mb-3 flex items-center justify-between">
                    <span>💬 社区交流 ({comments.length})</span>
                  </h4>

                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {comments.length === 0 ? (
                      <p className="text-[11px] text-white/30 text-center py-4">
                        还没有人评论，快来抢沙发~
                      </p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5 text-xs">
                          <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-[10px]">
                            {c.author_avatar ? (
                              <img src={c.author_avatar} alt="u" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              '👤'
                            )}
                          </div>
                          <div className="flex-1 bg-white/[0.03] rounded-xl p-2.5 border border-white/5">
                            <span className="font-semibold text-white/80 text-[11px] block">
                              {c.author_name || '社区用户'}
                            </span>
                            <p className="text-white/70 mt-0.5 text-xs leading-relaxed">{c.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 发送评论框 */}
                  <form onSubmit={handleAddComment} className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="写下对这部作品的赞美或心得..."
                      maxLength={200}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none transition"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !newComment.trim()}
                      className="rounded-xl bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 px-3 py-2 text-xs font-bold hover:bg-cyan-400/30 disabled:opacity-40 transition"
                    >
                      发送
                    </button>
                  </form>
                </div>
              </div>

              {/* 底部固定操作区：点赞 + 一键做同款 */}
              <div className="p-4 border-t border-white/[0.08] bg-[#0f1115] flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={likeBusy}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold transition border ${
                    post.is_liked
                      ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 shadow-lg shadow-pink-500/10'
                      : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className={`text-base transition-transform ${post.is_liked ? 'scale-125' : ''}`}>
                    {post.is_liked ? '❤️' : '🤍'}
                  </span>
                  <span>{post.likes_count || 0}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemix}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 px-5 py-3 text-xs font-extrabold text-black shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-[0.98] transition"
                >
                  <span>✨</span>
                  <span>一键做同款 (Remix)</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
