'use client';

import { useState, useEffect } from 'react';
import { X, Folder, FolderPlus, Palette, Loader2 } from 'lucide-react';

const FOLDER_COLORS = [
  { label: '电光青', value: '#22d3ee' },
  { label: '霓虹紫', value: '#a855f7' },
  { label: '翡翠绿', value: '#10b981' },
  { label: '日落橙', value: '#f97316' },
  { label: '樱花粉', value: '#ec4899' },
  { label: '深空蓝', value: '#3b82f6' },
];

export default function CreateFolderModal({
  isOpen,
  onClose,
  onSubmit,
  parentFolder = null,
  editingFolder = null,
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#22d3ee');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingFolder) {
      setName(editingFolder.name || '');
      setColor(editingFolder.color || '#22d3ee');
    } else {
      setName('');
      setColor(parentFolder?.color || '#22d3ee');
    }
    setError('');
  }, [editingFolder, parentFolder, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(editingFolder);
  const isSubfolder = Boolean(parentFolder);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    if (trimmed.length > 64) {
      setError('文件夹名称不能超过64个字符');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onSubmit({
        name: trimmed,
        color,
        parentId: isEditing ? editingFolder.parent_id : (parentFolder?.id || null),
      });
      onClose();
    } catch (err) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-md animate-in fade-in duration-base">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-canvas p-6 shadow-elevation-4 shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-line-subtle">
          <div className="flex items-center gap-3">
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {isSubfolder ? <FolderPlus className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">
                {isEditing ? '重命名文件夹' : isSubfolder ? `新建二级子文件夹` : '新建分类文件夹'}
              </h3>
              {isSubfolder && !isEditing && (
                <p className="text-xs text-ink-subtle">
                  归属于：<span className="text-ink font-medium">{parentFolder?.name}</span>
                </p>
              )}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              文件夹名称 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="如：电商主图、二次元立绘、影视分镜..."
              maxLength={64}
              className="w-full rounded-xl border border-line bg-wash px-3.5 py-2.5 text-sm text-ink placeholder-ink-subtle focus:border-line-accent focus:bg-wash-strong transition-all"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-muted mb-2">
              <Palette className="w-3.5 h-3.5 text-ink-subtle" />
              标记色彩
            </label>
            <div className="flex items-center gap-3">
              {FOLDER_COLORS.map((item) => {
                const isSelected = color === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setColor(item.value)}
                    title={item.label}
                    className={`
                      relative h-7 w-7 rounded-full transition-transform
                      ${isSelected ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0c0d10]' : 'hover:scale-105 opacity-80 hover:opacity-100'}
                    `}
                    style={{ backgroundColor: item.value }}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger-soft border border-danger-soft px-3 py-2 text-xs text-danger">
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
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-info px-5 py-2 text-xs font-medium text-ink-inverse shadow-elevation-2 shadow-[#22d3ee]/20 hover:opacity-95 transition-all disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEditing ? '保存修改' : '确认创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
