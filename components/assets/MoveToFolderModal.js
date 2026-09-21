'use client';

import { useState } from 'react';
import { X, Folder, FolderOpen, CornerDownRight, Check, Loader2, Inbox } from 'lucide-react';

export default function MoveToFolderModal({
  isOpen,
  onClose,
  onMove,
  folderTree = [],
  currentFolderId = null,
  assetCount = 1,
}) {
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId || 'root');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError('');
      const targetId = selectedFolderId === 'root' ? null : selectedFolderId;
      await onMove(targetId);
      onClose();
    } catch (err) {
      setError(err.message || '移动失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-md animate-in fade-in duration-base">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-canvas p-6 shadow-elevation-4 shadow-black/80 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-line-subtle">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">移动素材至分类</h3>
              <p className="text-xs text-ink-subtle">已选择 {assetCount} 项生成素材</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-wash-strong hover:text-ink transition-colors"
            aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
          {/* 根目录/未分类选项 */}
          <button
            type="button"
            onClick={() => setSelectedFolderId('root')}
            className={`
              w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all
              ${selectedFolderId === 'root' 
                ? 'bg-brand/15 text-brand border border-line-accent/30 font-medium' 
                : 'text-ink-muted hover:bg-wash hover:text-ink border border-transparent'}
            `}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className="w-4 h-4 text-ink-subtle" />
              <span className="text-sm">未分类 (根目录)</span>
            </div>
            {selectedFolderId === 'root' && <Check className="w-4 h-4 text-brand" />}
          </button>

          {/* 文件夹树 */}
          {folderTree.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            const hasChildren = Array.isArray(folder.children) && folder.children.length > 0;

            return (
              <div key={folder.id} className="space-y-1">
                {/* 一级文件夹 */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`
                    w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all
                    ${isSelected 
                      ? 'bg-brand/15 text-brand border border-line-accent/30 font-medium' 
                      : 'text-ink hover:bg-wash hover:text-ink border border-transparent'}
                  `}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.color || '#22d3ee' }} />
                    <span className="text-sm truncate">{folder.name}</span>
                    <span className="text-[11px] text-ink-subtle px-1.5 py-0.5 rounded bg-wash">
                      {folder.asset_count || 0}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-brand" />}
                </button>

                {/* 二级子文件夹 */}
                {hasChildren && (
                  <div className="ml-5 pl-2 border-l border-line space-y-1">
                    {folder.children.map((sub) => {
                      const isSubSelected = selectedFolderId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedFolderId(sub.id)}
                          className={`
                            w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all text-xs
                            ${isSubSelected 
                              ? 'bg-brand/15 text-brand border border-line-accent/30 font-medium' 
                              : 'text-ink-muted hover:bg-wash hover:text-ink border border-transparent'}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <CornerDownRight className="w-3.5 h-3.5 text-ink-subtle" />
                            <span className="truncate">{sub.name}</span>
                            <span className="text-micro text-ink-subtle px-1 py-0.2 rounded bg-wash">
                              {sub.asset_count || 0}
                            </span>
                          </div>
                          {isSubSelected && <Check className="w-3.5 h-3.5 text-brand" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {folderTree.length === 0 && (
            <div className="py-6 text-center text-xs text-ink-subtle">
              您当前还没有创建任何自定义分类文件夹
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-danger-soft border border-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-line-subtle">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-xs font-medium text-ink-muted hover:bg-wash-strong hover:text-ink transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-info px-5 py-2 text-xs font-medium text-ink-inverse shadow-elevation-2 shadow-[#22d3ee]/20 hover:opacity-95 transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认移动
          </button>
        </div>
      </div>
    </div>
  );
}
