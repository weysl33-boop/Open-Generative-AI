'use client';

import { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Share2,
  Sparkles,
  Folder,
  FolderOpen,
  Calendar,
  Clock,
  Coins,
  Cpu,
  Hash,
  Sliders,
  Maximize2,
  Trash2,
  ExternalLink,
} from 'lucide-react';

export default function AssetDetailModal({
  isOpen,
  asset,
  onClose,
  onRemix,
  onShareToCommunity,
  onMoveToFolder,
  onDelete,
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);

  if (!isOpen || !asset) return null;

  const isVideo = asset.asset_type === 'video';
  const isAudio = asset.asset_type === 'audio';

  const params = typeof asset.generation_params === 'object' && asset.generation_params
    ? asset.generation_params
    : {};

  const handleCopyPrompt = () => {
    if (asset.prompt) {
      navigator.clipboard?.writeText(asset.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleCopyNegative = () => {
    if (asset.negative_prompt) {
      navigator.clipboard?.writeText(asset.negative_prompt);
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    }
  };

  const handleDownload = () => {
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

  const formattedDate = asset.created_at
    ? new Date(asset.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-5xl h-[90vh] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d10] shadow-2xl shadow-black flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧：高清大图 / 视频播放区 */}
        <div className="relative flex-1 bg-black/60 flex items-center justify-center p-4 overflow-hidden border-b md:border-b-0 md:border-r border-white/[0.08]">
          {isVideo ? (
            <video
              src={asset.media_url}
              controls
              autoPlay
              loop
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <audio src={asset.media_url} controls className="w-80" />
            </div>
          ) : (
            <img
              src={asset.media_url}
              alt={asset.prompt || 'Generated Asset'}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          )}

          {/* 浮动原图预览链接 */}
          <a
            href={asset.media_url}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页打开高清原图"
            className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/70 hover:text-white backdrop-blur-md border border-white/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>查看原图</span>
          </a>
        </div>

        {/* 右侧：生成参数与元数据侧栏 */}
        <div className="w-full md:w-96 flex flex-col bg-[#0c0d10] h-full overflow-hidden">
          {/* 头部标题与关闭 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">素材技术参数</h3>
              <p className="text-[11px] text-white/40">全维度记录生成时间与指令配置</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-white/40 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 参数可滚动区 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-white/10">
            {/* 正向提示词 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-white/70">正向提示词 (Prompt)</span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 text-[11px] text-[#22d3ee] hover:underline"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPrompt ? '已复制' : '复制'}</span>
                </button>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-white/90 leading-relaxed text-xs break-words">
                {asset.prompt || <span className="text-white/30 italic">未记录提示词</span>}
              </div>
            </div>

            {/* 负向提示词 (如果有) */}
            {asset.negative_prompt && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-white/70">负向提示词 (Negative Prompt)</span>
                  <button
                    type="button"
                    onClick={handleCopyNegative}
                    className="flex items-center gap-1 text-[11px] text-[#22d3ee] hover:underline"
                  >
                    {copiedNegative ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedNegative ? '已复制' : '复制'}</span>
                  </button>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-white/80 leading-relaxed text-xs break-words">
                  {asset.negative_prompt}
                </div>
              </div>
            )}

            {/* 核心指标 2 列表格 */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">生成模型</span>
                <span className="font-medium text-white/90 truncate block" title={asset.model_name || asset.model_id}>
                  {asset.model_name || asset.model_id || '未指定'}
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">长宽比例 / 尺寸</span>
                <span className="font-medium text-white/90 truncate block">
                  {asset.aspect_ratio || (asset.width ? `${asset.width}x${asset.height}` : '默认比例')}
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">随机种子 (Seed)</span>
                <span className="font-medium text-white/90 truncate block">
                  {params.seed !== undefined ? params.seed : '系统随机'}
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">消耗算力</span>
                <span className="font-medium text-amber-400 flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  {asset.credit_cost || 0} 算力点
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">推理用时</span>
                <span className="font-medium text-white/90">
                  {asset.generation_duration_ms ? `${(asset.generation_duration_ms / 1000).toFixed(1)} 秒` : '极速'}
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-white/40 block mb-0.5">当前归属分类</span>
                <span className="font-medium text-[#22d3ee] truncate block">
                  {asset.folder_name ? `📁 ${asset.folder_name}` : '未分类'}
                </span>
              </div>
            </div>

            {/* 生成时间戳 */}
            <div className="flex items-center gap-2 pt-1 text-[11px] text-white/40">
              <Calendar className="w-3.5 h-3.5" />
              <span>生成于：{formattedDate || '未知'}</span>
            </div>
          </div>

          {/* 底部行动栏 */}
          <div className="p-4 border-t border-white/[0.06] bg-black/40 space-y-2 flex-shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRemix(asset);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a855f7] py-2 text-xs font-semibold text-black hover:opacity-95 shadow-lg shadow-[#22d3ee]/20 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>一键做同款</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShareToCommunity(asset);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 py-2 text-xs font-medium text-amber-300 hover:bg-amber-400/20 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>发布到社区</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMoveToFolder(asset);
                }}
                className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>移动分类...</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDelete(asset);
                  }}
                  className="flex items-center gap-1 text-[11px] text-rose-400/80 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
