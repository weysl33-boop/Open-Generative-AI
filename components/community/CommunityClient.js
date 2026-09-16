'use client';

import { useState, useEffect, useCallback } from 'react';
import CommunityDetailModal from './CommunityDetailModal';

const CATEGORIES = [
  { id: 'all', label: '🌟 探索发现' },
  { id: 'image', label: '🖼️ AI 绘画' },
  { id: 'video', label: '🎬 AI 视频' },
  { id: 'audio', label: '🎵 AI 音乐' },
  { id: 'workflow', label: '⚡ 设计工作流' },
];

const SORTS = [
  { id: 'trending', label: '🔥 热门趋势' },
  { id: 'newest', label: '⚡ 最新发布' },
  { id: 'likes', label: '💖 最多赞赏' },
];

export default function CommunityClient({ initialPostId = null }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePostId, setActivePostId] = useState(initialPostId);
  const [toastMsg, setToastMsg] = useState('');

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (sort) params.set('sort', sort);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('limit', '36');

      const res = await fetch(`/api/community/posts?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch (e) {
      console.error('加载社区作品失败', e);
      triggerToast('加载社区作品失败，请刷新');
    } finally {
      setLoading(false);
    }
  }, [category, sort, searchQuery]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadPosts();
  };

  const handleCardLike = async (post, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) =>
          prev.map((item) =>
            item.id === post.id
              ? { ...item, is_liked: data.isLiked, likes_count: data.likesCount }
              : item
          )
        );
      } else {
        triggerToast(data.error || '请先登录');
      }
    } catch {
      triggerToast('网络连接失败');
    }
  };

  const handleCardRemix = (post, e) => {
    e.stopPropagation();
    fetch(`/api/community/posts/${post.id}/remix`, { method: 'POST' }).catch(() => {});

    const mediaType = post.media_type || 'image';
    let targetStudio = 'image';
    if (mediaType === 'video') targetStudio = 'video';
    else if (mediaType === 'audio') targetStudio = 'audio';
    else if (mediaType === 'workflow') targetStudio = 'workflow';

    const queryParams = new URLSearchParams();
    if (post.prompt) queryParams.set('remixPrompt', post.prompt);
    if (post.model_name) queryParams.set('remixModel', post.model_name);

    window.location.href = `/studio/${targetStudio}?${queryParams.toString()}`;
  };

  const handleLikeChangeFromModal = (postId, isLiked, likesCount) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === postId ? { ...item, is_liked: isLiked, likes_count: likesCount } : item))
    );
  };

  return (
    <main className="min-h-screen bg-[#07080a] text-white">
      {/* 顶部 Toast */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full border border-cyan-400/40 bg-[#121820]/95 px-5 py-2.5 text-xs font-semibold text-cyan-300 shadow-2xl backdrop-blur-xl animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* 顶部统一导航条 */}
      <header className="border-b border-white/[0.08] bg-[#0c0e12]/85 backdrop-blur-xl sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <a href="/studio" className="flex items-center gap-2 group">
              <span className="text-xl font-black bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent group-hover:opacity-90 transition">
                KoyoSIM 即梦社区
              </span>
            </a>
            <div className="hidden sm:flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>灵感与做同款</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/creations"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition"
            >
              <span>📁 我的作品</span>
            </a>
            <a
              href="/studio"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-1.5 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 transition"
            >
              <span>✨ 进入 Studio 创作</span>
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* 即梦风探索氛围栏与搜索框 */}
        <div className="relative mb-8 rounded-3xl border border-white/10 bg-gradient-to-b from-[#14171f]/80 to-[#0c0e12]/80 p-6 sm:p-10 shadow-2xl backdrop-blur-xl overflow-hidden text-center">
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-gradient-to-r from-cyan-500/15 via-purple-500/15 to-blue-500/15 blur-3xl" />
          
          <h1 className="relative text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            汇聚 AI 创作者的万千灵感，<span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">一键即可做同款</span>
          </h1>
          <p className="relative mt-2 text-xs sm:text-sm text-white/50 max-w-xl mx-auto">
            参考即梦沉浸社区，生图、生视频、生音乐等作品自由流转，随时复用创作者 Prompt 与生图模型参数。
          </p>

          {/* 居中搜索栏 */}
          <form onSubmit={handleSearchSubmit} className="relative mt-6 max-w-2xl mx-auto flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索感兴趣的提示词 Prompt、风格、AI 模型..."
                className="w-full rounded-2xl border border-white/15 bg-black/40 pl-11 pr-4 py-3 text-sm text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition shadow-inner"
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-3 text-sm font-bold shadow-md shadow-cyan-400/20 transition"
            >
              搜索
            </button>
          </form>
        </div>

        {/* 频道分类与排序控制条 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'bg-cyan-400 text-black shadow-md shadow-cyan-400/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {SORTS.map((s) => {
              const active = sort === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={`rounded-xl px-3 py-1 text-xs font-medium transition ${
                    active ? 'bg-white/10 text-cyan-300 border border-cyan-400/30' : 'text-white/40 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 作品瀑布流 */}
        {loading ? (
          <div className="py-32 text-center text-sm text-white/40 flex flex-col items-center justify-center gap-3">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <span>探索发现正在加载中...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] py-24 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-2xl">
              🌌
            </div>
            <h3 className="text-base font-bold text-white">暂未找到相关灵感作品</h3>
            <p className="mt-1 text-xs text-white/40">成为第一个在此频道发布创作的艺术家吧！</p>
            <a
              href="/creations"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 transition"
            >
              📢 从我的作品库分享
            </a>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-5 space-y-5">
            {posts.map((post) => {
              const isVideo = post.media_type === 'video';
              const isAudio = post.media_type === 'audio';

              return (
                <div
                  key={post.id}
                  onClick={() => setActivePostId(post.id)}
                  className="group relative break-inside-avoid rounded-2xl border border-white/10 bg-[#111317] overflow-hidden hover:border-cyan-400/40 hover:shadow-2xl hover:shadow-cyan-500/10 transition duration-300 cursor-pointer flex flex-col"
                >
                  {/* 媒体封面 */}
                  <div className="relative w-full bg-black/60 overflow-hidden">
                    {isVideo ? (
                      <div className="relative aspect-[9/14] sm:aspect-auto">
                        <video
                          src={post.media_url}
                          className="w-full h-auto object-cover transition duration-300 group-hover:scale-102"
                          muted
                          loop
                          onMouseEnter={(e) => e.target.play()}
                          onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                        />
                        <div className="absolute top-2.5 left-2.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white/90 border border-white/10 flex items-center gap-1">
                          <span>▶</span> <span>视频</span>
                        </div>
                      </div>
                    ) : isAudio ? (
                      <div className="p-6 bg-gradient-to-b from-[#1a1d26] to-[#0f1116] flex flex-col items-center justify-center text-center">
                        <div className="h-20 w-20 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-3xl mb-3 shadow-lg group-hover:rotate-45 transition duration-500">
                          🎵
                        </div>
                        <h4 className="text-xs font-bold text-white truncate max-w-[200px]">{post.title}</h4>
                        <span className="text-[10px] text-cyan-300/60 font-mono mt-1">AI Audio Track</span>
                      </div>
                    ) : (
                      <img
                        src={post.cover_url || post.media_url}
                        alt={post.title}
                        loading="lazy"
                        className="w-full h-auto object-cover transition duration-300 group-hover:scale-102"
                      />
                    )}

                    {/* 悬停快捷按钮区 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => handleCardLike(post, e)}
                          className={`rounded-full p-2 backdrop-blur-md transition ${
                            post.is_liked
                              ? 'bg-pink-500/30 text-pink-400 border border-pink-500/50'
                              : 'bg-black/60 text-white/80 hover:bg-black/80 hover:text-white border border-white/10'
                          }`}
                          title="点赞"
                        >
                          <span className="text-sm">{post.is_liked ? '❤️' : '🤍'}</span>
                        </button>
                      </div>

                      <div>
                        <p className="text-xs text-white/90 line-clamp-2 mb-2.5 font-medium">
                          {post.prompt || post.title}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => handleCardRemix(post, e)}
                          className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2 text-xs font-extrabold text-black shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                        >
                          <span>✨</span>
                          <span>做同款</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 底部作者与信息栏 */}
                  <div className="p-3.5 flex items-center justify-between border-t border-white/[0.06] bg-[#111317]">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center flex-shrink-0 overflow-hidden text-[10px]">
                        {post.author_avatar ? (
                          <img src={post.author_avatar} alt="u" className="h-full w-full object-cover" />
                        ) : (
                          '✨'
                        )}
                      </div>
                      <span className="text-xs font-medium text-white/80 truncate">
                        {post.author_name || post.author_username || 'AI 探索家'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <span>❤️</span>
                      <span className="font-mono">{post.likes_count || 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 沉浸式作品详情弹窗 */}
      {activePostId && (
        <CommunityDetailModal
          postId={activePostId}
          onClose={() => setActivePostId(null)}
          onLikeChange={handleLikeChangeFromModal}
        />
      )}
    </main>
  );
}
