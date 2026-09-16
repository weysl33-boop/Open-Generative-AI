'use client';

import { useState, useEffect, useCallback } from 'react';
import ShareToCommunityModal from '@/components/community/ShareToCommunityModal';

const CATEGORIES = [
  { id: 'all', label: '全部作品' },
  { id: 'image', label: 'AI 生图' },
  { id: 'video', label: 'AI 视频' },
  { id: 'audio', label: 'AI 音乐' },
  { id: 'workflow', label: '设计与工作流' },
];

export default function CreationsClient() {
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [shareTarget, setShareTarget] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, shared: 0, likes: 0 });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, creationsRes] = await Promise.all([
        fetch('/api/user/profile', { cache: 'no-store' }),
        fetch('/api/creations?limit=100', { cache: 'no-store' }),
      ]);

      const userData = await userRes.json().catch(() => ({}));
      const creationsData = await creationsRes.json().catch(() => ({}));

      if (userData.user) {
        setUser(userData.user);
        setStats({
          total: userData.user.stats?.totalCreations || 0,
          shared: userData.user.stats?.publishedPosts || 0,
          likes: userData.user.stats?.totalLikes || 0,
        });
      }

      if (Array.isArray(creationsData.creations)) {
        setCreations(creationsData.creations);
      }
    } catch (err) {
      console.error(err);
      showToast('数据加载失败，请刷新');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这条作品记录吗？若已发布到社区也将一并下架。')) return;

    try {
      const res = await fetch(`/api/creations?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCreations((prev) => prev.filter((item) => item.id !== id));
        showToast('作品已成功删除');
        if (previewItem?.id === id) setPreviewItem(null);
      } else {
        const d = await res.json();
        showToast(d.error || '删除失败');
      }
    } catch {
      showToast('网络请求错误');
    }
  };

  const handleCopyPrompt = (promptText, e) => {
    if (e) e.stopPropagation();
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    showToast('✨ 提示词已复制到剪贴板！');
  };

  const handleDownload = async (url, label, e) => {
    if (e) e.stopPropagation();
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-creation-${Date.now()}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('正在调起下载...');
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleRemix = (item, e) => {
    if (e) e.stopPropagation();
    const studioId = String(item.studio_id || item.studioId || 'image').toLowerCase();
    const meta = typeof item.metadata_json === 'object' ? (item.metadata_json || {}) : {};
    const prompt = item.label || meta.prompt || '';
    const model = item.model || meta.model || '';

    // 组装到对应工作室的 URL
    let targetStudio = 'image';
    if (studioId.includes('video') || studioId.includes('motion') || studioId.includes('cinema')) targetStudio = 'video';
    else if (studioId.includes('audio') || studioId.includes('music')) targetStudio = 'audio';
    else if (studioId.includes('workflow')) targetStudio = 'workflow';
    else if (studioId.includes('agent')) targetStudio = 'agents';

    const url = `/studio/${targetStudio}?remixPrompt=${encodeURIComponent(prompt)}&remixModel=${encodeURIComponent(model)}`;
    window.location.href = url;
  };

  const filteredCreations = creations.filter((item) => {
    if (selectedCategory === 'all') return true;
    const sId = String(item.studio_id || '').toLowerCase();
    if (selectedCategory === 'image') return !sId.includes('video') && !sId.includes('audio') && !sId.includes('workflow') && !sId.includes('agent');
    if (selectedCategory === 'video') return sId.includes('video') || sId.includes('motion') || sId.includes('cinema') || sId.includes('clip') || sId.includes('lip');
    if (selectedCategory === 'audio') return sId.includes('audio') || sId.includes('music') || sId.includes('sound');
    if (selectedCategory === 'workflow') return sId.includes('workflow') || sId.includes('agent') || sId.includes('design');
    return true;
  });

  return (
    <main className="min-h-screen bg-[#08090a] text-white">
      {/* 顶部 Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-full border border-cyan-400/40 bg-[#121820]/95 px-5 py-2.5 text-xs font-semibold text-cyan-300 shadow-2xl backdrop-blur-xl animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* 顶部导航与状态条 */}
      <div className="border-b border-white/[0.08] bg-[#0c0e12]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/studio"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              ← 返回 Studio
            </a>
            <div className="h-4 w-px bg-white/10" />
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>🎨 个人作品中心</span>
              <span className="text-xs font-normal text-white/40">My Creations</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/community"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500/15 to-purple-500/15 border border-cyan-400/30 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:border-cyan-400/60 transition shadow-sm"
            >
              <span>🔥 探索即梦社区</span>
            </a>
            <a
              href="/account"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 transition"
            >
              <span>👤 个人账户</span>
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* 数据面板与个人名片 */}
        <section className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-r from-[#12141a]/90 to-[#0e1014]/90 p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 p-0.5 shadow-lg shadow-cyan-500/10">
                <div className="h-full w-full rounded-2xl bg-[#12141a] flex items-center justify-center overflow-hidden">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl">✨</span>
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {user?.display_name || user?.username || '创作者'}
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-400/30 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                    AI Creator
                  </span>
                </h2>
                <p className="mt-1 text-xs text-white/50 line-clamp-1 max-w-md">
                  {user?.bio || '用 AI 拓展人类想象力的边界，探索无限灵感。'}
                </p>
              </div>
            </div>

            {/* 3 个资产指标卡 */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center min-w-[90px]">
                <p className="text-[11px] font-medium text-white/40">创作总计</p>
                <p className="mt-0.5 text-xl font-extrabold text-white font-mono">{creations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center min-w-[90px]">
                <p className="text-[11px] font-medium text-white/40">已发社区</p>
                <p className="mt-0.5 text-xl font-extrabold text-cyan-300 font-mono">{stats.shared}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center min-w-[90px]">
                <p className="text-[11px] font-medium text-white/40">累计获赞</p>
                <p className="mt-0.5 text-xl font-extrabold text-pink-400 font-mono">{stats.likes}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 分类过滤与控制栏 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-cyan-400 text-black shadow-md shadow-cyan-400/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-white/40">
            共 <span className="font-mono text-cyan-300">{filteredCreations.length}</span> 项创作素材
          </p>
        </div>

        {/* 作品列表瀑布/网格 */}
        {loading ? (
          <div className="py-24 text-center text-sm text-white/40 flex flex-col items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <span>正在加载您的创意资产库...</span>
          </div>
        ) : filteredCreations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.01] py-20 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-2xl">
              🎨
            </div>
            <h3 className="text-base font-bold text-white">暂无此类生成作品</h3>
            <p className="mt-1 text-xs text-white/40 max-w-sm mx-auto">
              立即前往 Studio 体验生图、生视频、生音乐等前沿 AI 大模型，尽情挥洒创意！
            </p>
            <a
              href="/studio"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 transition"
            >
              ✨ 开始第一次创作
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredCreations.map((item) => {
              const meta = typeof item.metadata_json === 'object' ? (item.metadata_json || {}) : {};
              const prompt = item.label || meta.prompt || '';
              const sId = String(item.studio_id || '').toLowerCase();
              const isVideo = sId.includes('video') || sId.includes('motion') || sId.includes('cinema');
              const isAudio = sId.includes('audio') || sId.includes('music');

              return (
                <div
                  key={item.id}
                  onClick={() => setPreviewItem(item)}
                  className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#121316] overflow-hidden hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition duration-200 cursor-pointer"
                >
                  {/* 媒体容器 */}
                  <div className="relative aspect-square w-full bg-black/60 flex items-center justify-center overflow-hidden">
                    {isVideo ? (
                      <video
                        src={item.result_url}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        muted
                        loop
                        onMouseEnter={(e) => e.target.play()}
                        onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                      />
                    ) : isAudio ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <div className="h-16 w-16 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-400/40 text-2xl animate-pulse">
                          🎵
                        </div>
                        <span className="text-xs text-cyan-300/80 font-mono">Audio Track</span>
                      </div>
                    ) : (
                      <img
                        src={item.result_url}
                        alt="Creation"
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    )}

                    {/* 类型指示角标 */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white/90 border border-white/10">
                      {isVideo ? '🎬 视频' : isAudio ? '🎵 音频' : '🖼️ 图像'}
                    </div>

                    {/* 社区分享状态角标 */}
                    {item.is_shared && (
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500/80 to-purple-500/80 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                        <span>✨ 已发布</span>
                        {item.community_likes > 0 && <span>({item.community_likes}赞)</span>}
                      </div>
                    )}

                    {/* 悬浮遮罩操作条 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3.5">
                      <p className="text-xs text-white/90 line-clamp-2 mb-3">
                        {prompt || '未包含文字提示词'}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleRemix(item, e)}
                          title="使用此参数做同款"
                          className="flex-1 rounded-lg bg-cyan-400 py-1.5 text-center text-xs font-bold text-black hover:bg-cyan-300 transition"
                        >
                          做同款
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareTarget(item);
                          }}
                          className="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs text-white hover:bg-white/25 transition"
                          title="分享到即梦社区"
                        >
                          📢 分享
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 底部信息条 */}
                  <div className="flex items-center justify-between p-3 text-[11px] text-white/50 border-t border-white/5">
                    <span className="truncate max-w-[120px] font-mono text-white/40">
                      {item.model || item.studio_id}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleCopyPrompt(prompt, e)}
                        className="hover:text-cyan-300 transition"
                        title="复制提示词"
                      >
                        复制词
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.id, e)}
                        className="hover:text-red-400 transition"
                        title="删除记录"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 弹窗 1：分享到社区 */}
      {shareTarget && (
        <ShareToCommunityModal
          creation={shareTarget}
          onClose={() => setShareTarget(null)}
          onSuccess={() => {
            showToast('🎉 作品已成功公开发布到即梦社区！');
            loadData();
          }}
        />
      )}

      {/* 弹窗 2：大图/多媒体沉浸式预览与做同款 */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl border border-white/10 bg-[#0e1014] text-white shadow-2xl overflow-hidden flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 左侧大图 / 播放器 */}
            <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] md:min-h-[500px]">
              {String(previewItem.studio_id || '').includes('video') ? (
                <video src={previewItem.result_url} controls autoPlay className="max-h-[75vh] w-full object-contain" />
              ) : String(previewItem.studio_id || '').includes('audio') ? (
                <div className="p-8 w-full max-w-md text-center">
                  <div className="h-24 w-24 mx-auto mb-4 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-4xl animate-pulse">
                    🎵
                  </div>
                  <audio src={previewItem.result_url} controls autoPlay className="w-full" />
                </div>
              ) : (
                <img src={previewItem.result_url} alt="Large" className="max-h-[75vh] w-full object-contain" />
              )}
            </div>

            {/* 右侧详细参数与操作 */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 p-5 flex flex-col justify-between bg-[#121418]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Creation Specs</span>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="text-white/50 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-[11px] text-white/40 block">提示词 Prompt</label>
                    <p className="text-xs text-white/90 bg-white/5 p-2.5 rounded-xl mt-1 max-h-36 overflow-y-auto select-all">
                      {previewItem.label || previewItem.metadata_json?.prompt || '无提示词'}
                    </p>
                  </div>

                  {previewItem.model && (
                    <div>
                      <label className="text-[11px] text-white/40 block">模型</label>
                      <p className="text-xs text-cyan-300 font-mono mt-0.5">{previewItem.model}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-white/40 block">创建时间</label>
                    <p className="text-xs text-white/60 font-mono mt-0.5">
                      {new Date(previewItem.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={(e) => handleRemix(previewItem, e)}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 transition"
                >
                  ⚡ 一键带入 Studio 做同款
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = previewItem;
                    setPreviewItem(null);
                    setShareTarget(target);
                  }}
                  className="w-full rounded-xl border border-cyan-400/40 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
                >
                  📢 发布分享到即梦社区
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDownload(previewItem.result_url, previewItem.label, e)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition"
                >
                  📥 下载高清原资源
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
