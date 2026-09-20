'use client';

import { useState } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  CornerDownRight,
  Inbox,
  Star,
  Layers,
  FolderPlus,
} from 'lucide-react';

export default function FolderTree({
  folderTree = [],
  counts = {},
  selectedFolderId = 'all',
  onSelectFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
}) {
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [activeMenuFolderId, setActiveMenuFolderId] = useState(null);

  const toggleExpand = (folderId, e) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full select-none">
      {/* 预置分类 */}
      <div className="space-y-1 mb-4">
        <button
          type="button"
          onClick={() => onSelectFolder('all')}
          className={`
            w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all
            ${selectedFolderId === 'all'
              ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/25 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
              : 'text-white/70 hover:bg-white/[0.04] hover:text-white border border-transparent'}
          `}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-[#22d3ee]" />
            <span>全部素材</span>
          </div>
          <span className="text-[11px] text-white/40 px-1.5 py-0.5 rounded bg-white/[0.05]">
            {counts.total || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFolder('unorganized')}
          className={`
            w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all
            ${selectedFolderId === 'unorganized'
              ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/25 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
              : 'text-white/70 hover:bg-white/[0.04] hover:text-white border border-transparent'}
          `}
        >
          <div className="flex items-center gap-2.5">
            <Inbox className="w-4 h-4 text-amber-400" />
            <span>未分类素材</span>
          </div>
          <span className="text-[11px] text-white/40 px-1.5 py-0.5 rounded bg-white/[0.05]">
            {counts.unorganized || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFolder('favorites')}
          className={`
            w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all
            ${selectedFolderId === 'favorites'
              ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/25 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
              : 'text-white/70 hover:bg-white/[0.04] hover:text-white border border-transparent'}
          `}
        >
          <div className="flex items-center gap-2.5">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400/20" />
            <span>我的收藏</span>
          </div>
          <span className="text-[11px] text-white/40 px-1.5 py-0.5 rounded bg-white/[0.05]">
            {counts.favorites || 0}
          </span>
        </button>
      </div>

      {/* 自定分类文件夹标题与新建 */}
      <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          分类文件夹 (两级)
        </span>
        <button
          type="button"
          onClick={() => onCreateFolder(null)}
          title="新建一级分类文件夹"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[#22d3ee] hover:bg-[#22d3ee]/10 transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建</span>
        </button>
      </div>

      {/* 文件夹列表 */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {folderTree.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          const hasChildren = Array.isArray(folder.children) && folder.children.length > 0;
          const isExpanded = expandedFolders.has(folder.id) || isSelected;
          const isMenuOpen = activeMenuFolderId === folder.id;

          return (
            <div key={folder.id} className="space-y-1">
              {/* 一级文件夹节点 */}
              <div className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectFolder(folder.id)}
                  className={`
                    w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all text-left
                    ${isSelected
                      ? 'bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 text-[#22d3ee] border border-[#22d3ee]/25 font-semibold shadow-[0_0_10px_rgba(34,211,238,0.08)]'
                      : 'text-white/75 hover:bg-white/[0.04] hover:text-white border border-transparent font-medium'}
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {hasChildren ? (
                      <span
                        onClick={(e) => toggleExpand(folder.id, e)}
                        className="p-0.5 text-white/40 hover:text-white transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>
                    ) : (
                      <span className="w-3.5" />
                    )}

                    <Folder
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: folder.color || '#22d3ee' }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] text-white/35 group-hover:hidden">
                      {folder.asset_count || 0}
                    </span>

                    {/* 快捷悬浮菜单 */}
                    <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onCreateFolder(folder)}
                        title="新建二级子文件夹"
                        className="p-1 rounded text-white/50 hover:bg-white/10 hover:text-[#22d3ee] transition-colors"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditFolder(folder)}
                        title="重命名"
                        className="p-1 rounded text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteFolder(folder)}
                        title="删除文件夹"
                        className="p-1 rounded text-white/50 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </button>
              </div>

              {/* 二级子文件夹节点 (深度为 2) */}
              {hasChildren && isExpanded && (
                <div className="ml-4 pl-2.5 border-l border-white/[0.08] space-y-1">
                  {folder.children.map((sub) => {
                    const isSubSelected = selectedFolderId === sub.id;
                    return (
                      <div key={sub.id} className="group relative flex items-center">
                        <button
                          type="button"
                          onClick={() => onSelectFolder(sub.id)}
                          className={`
                            w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all text-left
                            ${isSubSelected
                              ? 'bg-[#22d3ee]/15 text-[#22d3ee] border border-[#22d3ee]/25 font-semibold'
                              : 'text-white/60 hover:bg-white/[0.04] hover:text-white border border-transparent font-normal'}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-1">
                            <CornerDownRight className="w-3 h-3 text-white/25 flex-shrink-0" />
                            <Folder
                              className="w-3.5 h-3.5 flex-shrink-0"
                              style={{ color: sub.color || folder.color || '#22d3ee' }}
                            />
                            <span className="truncate">{sub.name}</span>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] text-white/30 group-hover:hidden">
                              {sub.asset_count || 0}
                            </span>

                            <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => onEditFolder(sub)}
                                title="重命名"
                                className="p-1 rounded text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFolder(sub)}
                                title="删除子文件夹"
                                className="p-1 rounded text-white/50 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {folderTree.length === 0 && (
          <div className="p-4 text-center border border-dashed border-white/[0.06] rounded-xl my-2">
            <p className="text-xs text-white/40 mb-2">暂无自定义分类</p>
            <button
              type="button"
              onClick={() => onCreateFolder(null)}
              className="text-[11px] text-[#22d3ee] hover:underline"
            >
              + 创建第一个文件夹
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
