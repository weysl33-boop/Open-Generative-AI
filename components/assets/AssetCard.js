'use client';

import { useState } from 'react';
import {
  Image as ImageIcon,
  Clapperboard,
  AudioLines,
  Wand2,
  Copy,
  Check,
  Star,
  Download,
  Share2,
  FolderInput,
  Trash2,
  Maximize2,
  Sparkles,
} from 'lucide-react';

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function AssetCard({
  asset,
  onOpenDetail,
  onCopyPrompt,
  onRemix,
  onMoveToFolder,
  onShareToCommunity,
  onToggleFavorite,
  onDelete,
}) {
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isVideo = asset.asset_type === 'video';
  const isAudio = asset.asset_type === 'audio';
  const isWorkflow = asset.asset_type === 'workflow';

  const handleCopy = (e) => {
    e.stopPropagation();
    if (asset.prompt) {
      navigator.clipboard?.writeText(asset.prompt);
      setCopied(true);
      onCopyPrompt?.(asset.prompt);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    if (asset.media_url) {
      const a = document.createElement('a');
      a.href = asset.media_url;
      a.download = `${asset.title || 'koyosim-asset'}.${isVideo ? 'mp4' : isAudio ? 'mp3' : 'webp'}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div
      onClick={() => onOpenDetail(asset)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d10] transition-all duration-300 hover:-translate-y-1 hover:border-[#22d3ee]/40 hover:shadow-xl hover:shadow-[#22d3ee]/5 cursor-pointer select-none"
    >
      {/* 媒体展示容器 */}
      <div className="relative aspect-square w-full overflow-hidden bg-black/40 flex items-center justify-center">
        {isVideo ? (
          <video
            src={asset.media_url}
            poster={asset.thumbnail_url}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.target.play?.().catch(() => {})}
            onMouseLeave={(e) => {
              e.target.pause?.();
              e.target.currentTime = 0;
            }}
          />
        ) : isAudio ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-white/50">
            <AudioLines className="w-12 h-12 text-[#22d3ee]/70 animate-pulse" />
            <span className="text-xs text-white/40">音频生成素材</span>
          </div>
        ) : imageError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-white/40">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span className="text-[11px]">预览已过期或加载失败</span>
          </div>
        ) : (
          <img
            src={asset.thumbnail_url || asset.media_url}
            alt={asset.title || asset.prompt || 'Generated Asset'}
            loading="lazy"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {/* 顶部标签栏 */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5">
            {/* 类别 Badge */}
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-md border border-white/10">
              {isVideo ? (
                <>
                  <Clapperboard className="w-3 h-3 text-purple-400" />
                  <span>视频</span>
                </>
              ) : isAudio ? (
                <>
                  <AudioLines className="w-3 h-3 text-emerald-400" />
                  <span>音频</span>
                </>
              ) : isWorkflow ? (
                <>
                  <Wand2 className="w-3 h-3 text-amber-400" />
                  <span>工作流</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3 h-3 text-[#22d3ee]" />
                  <span>图像</span>
                </>
              )}
            </span>

            {/* 模型 Badge */}
            {asset.model_name && (
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/60 backdrop-blur-md border border-white/10 truncate max-w-[110px]">
                {asset.model_name}
              </span>
            )}
          </div>

          {/* 收藏按钮 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(asset);
            }}
            title={asset.is_favorite ? '取消收藏' : '加入收藏'}
            className="pointer-events-auto rounded-lg bg-black/60 p-1.5 backdrop-blur-md border border-white/10 text-white/50 hover:text-yellow-400 transition-colors"
          >
            <Star
              className={`w-3.5 h-3.5 ${asset.is_favorite ? 'text-yellow-400 fill-yellow-400' : ''}`}
            />
          </button>
        </div>

        {/* 悬浮遮罩操作条 */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopy}
                title="复制提示词"
                className="rounded-lg bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemix(asset);
                }}
                title="做同款 (Remix)"
                className="rounded-lg bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-[#22d3ee] transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToFolder(asset);
                }}
                title="移动至文件夹"
                className="rounded-lg bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-purple-400 transition-colors"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShareToCommunity(asset);
                }}
                title="发布到社区作品"
                className="rounded-lg bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-amber-400 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDownload}
                title="下载素材"
                className="rounded-lg bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(asset);
                }}
                title="删除素材"
                className="rounded-lg bg-white/10 hover:bg-rose-500/30 p-2 text-white/80 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 底部信息面板 */}
      <div className="flex flex-col p-3 gap-1.5 flex-1 justify-between">
        <p className="text-xs text-white/90 line-clamp-2 leading-relaxed font-normal">
          {asset.prompt || asset.title || '无提示词记录'}
        </p>

        <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/[0.04]">
          <span className="truncate max-w-[120px]">
            {asset.folder_name ? (
              <span className="text-[#22d3ee]/80 font-medium">📁 {asset.folder_name}</span>
            ) : (
              '未分类'
            )}
          </span>
          <span className="flex-shrink-0">{formatRelativeTime(asset.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
