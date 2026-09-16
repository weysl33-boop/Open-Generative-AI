'use client';

import { useState } from 'react';

const PRESET_TAGS = [
  '赛博朋克', '动漫二次元', '超写实', '电影光影',
  '概念设计', '国风古韵', '未来科技', '复古胶片',
  '治愈系', '史诗大片', '迷幻电子', '超高清壁纸'
];

export default function ShareToCommunityModal({ creation, onClose, onSuccess }) {
  if (!creation) return null;

  const initialMediaType = (() => {
    const sId = String(creation.studio_id || creation.studioId || '').toLowerCase();
    if (sId.includes('video') || sId.includes('motion') || sId.includes('cinema') || sId.includes('lip')) return 'video';
    if (sId.includes('audio') || sId.includes('music') || sId.includes('sound')) return 'audio';
    if (sId.includes('workflow') || sId.includes('agent') || sId.includes('design')) return 'workflow';
    return 'image';
  })();

  const metadata = typeof creation.metadata_json === 'object' ? (creation.metadata_json || {}) : {};
  const initialPrompt = creation.label || metadata.prompt || '';
  const initialModel = creation.model || metadata.model || '';

  const [title, setTitle] = useState(creation.label ? creation.label.slice(0, 40) : '我的 AI 创意作品');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState(['超写实']);
  const [customTag, setCustomTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length >= 6) return;
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddCustomTag = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clean = customTag.trim();
      if (clean && !selectedTags.includes(clean) && selectedTags.length < 6) {
        setSelectedTags([...selectedTags, clean]);
        setCustomTag('');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationId: creation.id,
          title: title.trim(),
          description: description.trim(),
          mediaType: initialMediaType,
          mediaUrl: creation.result_url || creation.resultUrl,
          coverUrl: creation.result_url || creation.resultUrl,
          prompt: initialPrompt,
          modelName: initialModel,
          parameters: metadata,
          tags: selectedTags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '发布失败，请稍后重试');
      }

      if (onSuccess) onSuccess(data.post);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#0d0f12] p-6 text-white shadow-2xl overflow-hidden">
        {/* 背景光效 */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl" />

        <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-cyan-400 font-semibold">Community Showcase</span>
            <h2 className="text-xl font-bold mt-0.5">分享作品到即梦社区</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative mt-5 space-y-4 text-sm">
          {/* 媒体预览条目 */}
          <div className="flex items-center gap-3.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-black border border-white/10 flex items-center justify-center">
              {initialMediaType === 'video' ? (
                <video src={creation.result_url || creation.resultUrl} className="h-full w-full object-cover" muted />
              ) : initialMediaType === 'audio' ? (
                <div className="text-cyan-400 text-2xl">🎵</div>
              ) : (
                <img src={creation.result_url || creation.resultUrl} alt="Preview" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-cyan-300/90 font-medium">
                {initialMediaType === 'video' ? '🎬 AI 视频作品' : initialMediaType === 'audio' ? '🎵 AI 音乐作品' : '🖼️ AI 图像作品'}
              </p>
              <p className="text-xs text-white/70 truncate mt-0.5">
                {initialPrompt || '未指定提示词'}
              </p>
              {initialModel && (
                <span className="inline-block mt-1 text-[11px] text-white/40 font-mono">
                  模型: {initialModel}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">作品标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给作品起一个吸引人的标题..."
              maxLength={60}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">作品心得或创作描述（选填）</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="分享灵感来源、构图技巧或参数设置心得..."
              maxLength={300}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-white/70">精选标签（最多选6个）</label>
              <span className="text-[11px] text-white/40">{selectedTags.length}/6</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                        : 'bg-white/5 text-white/60 border border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={handleAddCustomTag}
                placeholder="回车自定义标签..."
                maxLength={15}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white placeholder-white/30 focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-[11px] text-white/35">按回车添加</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-2 text-xs font-bold text-black shadow-lg shadow-cyan-500/20 hover:from-cyan-300 hover:to-blue-400 active:scale-[0.98] transition disabled:opacity-50"
            >
              {submitting ? '正在公开发布...' : '🚀 立即公开发布'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
