'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Image as ImageIcon,
  Clapperboard,
  AudioLines,
  Wand2,
  Search,
  Filter,
  ArrowUpDown,
  FolderPlus,
  RefreshCw,
  Folder,
  FolderOpen,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import FolderTree from './FolderTree';
import AssetCard from './AssetCard';
import AssetDetailModal from './AssetDetailModal';
import CreateFolderModal from './CreateFolderModal';
import MoveToFolderModal from './MoveToFolderModal';
import ShareToCommunityModal from '@/components/community/ShareToCommunityModal';

const APP_CATEGORIES = [
  { id: 'all', label: '全部素材', icon: Layers },
  { id: 'image', label: '图像 (Images)', icon: ImageIcon },
  { id: 'video', label: '视频 (Video)', icon: Clapperboard },
  { id: 'audio', label: '音频 (Audio)', icon: AudioLines },
  { id: 'workflow', label: '工作流 (Workflows)', icon: Wand2 },
];

export default function AssetLibraryClient({ locale = 'zh', onTabChange = null }) {
  const router = useRouter();

  // 核心数据状态
  const [folderTree, setFolderTree] = useState([]);
  const [counts, setCounts] = useState({});
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 过滤与筛选
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 侧边栏折叠
  const [isFolderPanelOpen, setIsFolderPanelOpen] = useState(true);

  // 模态框状态
  const [createFolderModal, setCreateFolderModal] = useState({
    isOpen: false,
    parentFolder: null,
    editingFolder: null,
  });

  const [moveModal, setMoveModal] = useState({
    isOpen: false,
    asset: null,
  });

  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    asset: null,
  });

  const [shareModal, setShareModal] = useState({
    isOpen: false,
    asset: null,
  });

  // 提示反馈
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  // 加载文件夹与统计
  const fetchFoldersAndCounts = useCallback(async () => {
    try {
      const [foldersRes, summaryRes] = await Promise.all([
        fetch('/api/assets/folders', { cache: 'no-store' }),
        fetch('/api/assets?summary=true', { cache: 'no-store' }),
      ]);

      if (foldersRes.ok) {
        const data = await foldersRes.json();
        setFolderTree(data.folderTree || []);
      }
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setCounts(sumData.counts || {});
      }
    } catch (err) {
      console.error('[fetchFoldersAndCounts]', err);
    }
  }, []);

  // 加载资产列表
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedFolderId === 'favorites') {
      params.set('favorite', 'true');
    } else if (selectedFolderId !== 'all') {
      params.set('folder_id', selectedFolderId);
    }

    if (selectedCategory !== 'all') {
      params.set('type', selectedCategory);
    }

    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    params.set('sort', sortOption);
    params.set('page', String(page));
    params.set('limit', '28');

    try {
      const res = await fetch(`/api/assets?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          setError('请先登录以访问您的资产库');
          setAssets([]);
          setLoading(false);
          return;
        }
        throw new Error('加载资产失败');
      }

      const data = await res.json();
      setAssets(data.assets || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err) {
      setError(err.message || '网络连接异常');
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, selectedCategory, searchQuery, sortOption, page]);

  useEffect(() => {
    fetchFoldersAndCounts();
  }, [fetchFoldersAndCounts]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // 获取当前选中文件夹对象
  const currentFolder = useMemo(() => {
    if (['all', 'unorganized', 'favorites'].includes(selectedFolderId)) {
      return null;
    }
    const findInTree = (list) => {
      for (const item of list) {
        if (item.id === selectedFolderId) return item;
        if (item.children?.length) {
          const found = findInTree(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findInTree(folderTree);
  }, [selectedFolderId, folderTree]);

  // 文件夹操作
  const handleCreateOrUpdateFolder = async ({ name, color, parentId }) => {
    if (createFolderModal.editingFolder) {
      const res = await fetch(`/api/assets/folders/${createFolderModal.editingFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '更新文件夹失败');
      }
      showToast('文件夹重命名成功');
    } else {
      const res = await fetch('/api/assets/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, parentId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '创建文件夹失败');
      }
      showToast(parentId ? '二级子文件夹创建成功' : '分类文件夹创建成功');
    }
    await fetchFoldersAndCounts();
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`确定要删除文件夹 "${folder.name}" 吗？内部的素材将安全移至未分类。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/folders/${folder.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');
      showToast('文件夹已删除，内部素材已安全回退至未分类');
      if (selectedFolderId === folder.id) {
        setSelectedFolderId('all');
      }
      await fetchFoldersAndCounts();
      await fetchAssets();
    } catch (err) {
      showToast(err.message || '删除失败');
    }
  };

  // 资产操作
  const handleToggleFavorite = async (asset) => {
    try {
      const nextFav = !asset.is_favorite;
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextFav }),
      });
      if (!res.ok) throw new Error('更新失败');

      setAssets((prev) =>
        prev.map((item) => (item.id === asset.id ? { ...item, is_favorite: nextFav } : item))
      );
      fetchFoldersAndCounts();
      showToast(nextFav ? '已加入收藏' : '已取消收藏');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteAsset = async (asset) => {
    if (!window.confirm('确定要彻底删除该素材吗？此操作不可撤销。')) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('删除失败');

      setAssets((prev) => prev.filter((item) => item.id !== asset.id));
      showToast('素材已删除');
      fetchFoldersAndCounts();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleMoveConfirm = async (targetFolderId) => {
    if (!moveModal.asset) return;
    const res = await fetch(`/api/assets/${moveModal.asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: targetFolderId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || '移动失败');
    }

    showToast('素材已移动到目标文件夹');
    fetchFoldersAndCounts();
    fetchAssets();
  };

  // 一键同款 Remix
  const handleRemix = (asset) => {
    const prompt = asset.prompt || '';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-gen:remix', {
          detail: {
            prompt,
            model: asset.model_id,
            type: asset.asset_type,
          },
        })
      );
    }
    // 跳转至对应 studio
    const targetStudio = asset.asset_type === 'video' ? 'video' : 'image';
    if (onTabChange) {
      onTabChange(targetStudio);
    } else {
      router.push(`/studio?tab=${targetStudio}`);
    }
    showToast('已回填提示词，正在进入工作室...');
  };

  return (
    <div className="flex h-full w-full bg-canvas text-ink overflow-hidden select-none">
      {/* 资产库左侧两级文件夹树面板 */}
      <aside
        className={`
          flex-shrink-0 border-r border-line bg-canvas p-3 transition-all duration-page flex flex-col z-raised
          ${isFolderPanelOpen ? 'w-64' : 'w-0 p-0 overflow-hidden border-none'}
        `}
      >
        <FolderTree
          folderTree={folderTree}
          counts={counts}
          selectedFolderId={selectedFolderId}
          onSelectFolder={(id) => {
            setSelectedFolderId(id);
            setPage(1);
          }}
          onCreateFolder={(parent) =>
            setCreateFolderModal({ isOpen: true, parentFolder: parent, editingFolder: null })
          }
          onEditFolder={(folder) =>
            setCreateFolderModal({ isOpen: true, parentFolder: null, editingFolder: folder })
          }
          onDeleteFolder={handleDeleteFolder}
        />
      </aside>

      {/* 资产库主工作区 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-canvas">
        {/* 顶部控制栏 */}
        <header className="flex-shrink-0 border-b border-line bg-base/80 backdrop-blur-md px-5 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            {/* 面包屑导航与展开侧栏按钮 */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsFolderPanelOpen(!isFolderPanelOpen)}
                className="p-1.5 rounded-lg text-ink-subtle hover:bg-wash-strong hover:text-ink transition-colors"
                title={isFolderPanelOpen ? '收起分类面板' : '展开分类面板'}
              >
                {isFolderPanelOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4 text-brand" />
                )}
              </button>

              <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
                <span
                  onClick={() => setSelectedFolderId('all')}
                  className="hover:text-ink cursor-pointer transition-colors"
                >
                  我的资产库
                </span>
                <ChevronRight className="w-3 h-3 text-ink-subtle" />
                <span className="text-ink font-medium truncate">
                  {selectedFolderId === 'all' && '全部素材'}
                  {selectedFolderId === 'unorganized' && '未分类素材'}
                  {selectedFolderId === 'favorites' && '我的收藏'}
                  {currentFolder && (
                    <span className="flex items-center gap-1">
                      <Folder className="w-3.5 h-3.5" style={{ color: currentFolder.color || '#22d3ee' }} />
                      {currentFolder.name}
                    </span>
                  )}
                </span>
                <span className="ml-1 text-[11px] text-ink-subtle font-mono">
                  ({totalCount})
                </span>
              </div>
            </div>

            {/* 搜索框与排序 */}
            <div className="flex items-center gap-3">
              {/* 实时搜索 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索提示词、模型..."
                  className="w-44 md:w-56 rounded-xl border border-line bg-wash pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-subtle focus:border-line-accent transition-all"
                />
              </div>

              {/* 排序下拉 */}
              <div className="relative">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="rounded-xl border border-line bg-wash px-3 py-1.5 text-xs text-ink focus:border-line-accent appearance-none pr-7 cursor-pointer"
                >
                  <option value="newest" className="bg-canvas">最新生成</option>
                  <option value="oldest" className="bg-canvas">最早生成</option>
                  <option value="model" className="bg-canvas">按模型排序</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-subtle" />
              </div>
            </div>
          </div>

          {/* 应用类别 Tab 组 (与当前应用分类 100% 对齐) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-1">
            {APP_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              const countNum = cat.id === 'all' ? counts.total : counts[cat.id];

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setPage(1);
                  }}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0
                    ${isActive
                      ? 'bg-brand-soft text-brand border border-brand-line'
                      : 'text-ink-muted hover:bg-wash hover:text-ink border border-transparent'}
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  {countNum !== undefined && (
                    <span className={`text-micro px-1.5 py-0.2 rounded ${isActive ? 'bg-brand/20 text-brand' : 'bg-wash-strong text-ink-subtle'}`}>
                      {countNum}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* 资产卡片瀑布流/网格主视窗 */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/10">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl border border-line-subtle bg-wash animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <AlertCircle className="w-12 h-12 text-danger mb-3 opacity-80" />
              <p className="text-sm text-ink mb-2">{error}</p>
              <button
                type="button"
                onClick={fetchAssets}
                className="flex items-center gap-1.5 rounded-xl bg-wash-press px-4 py-2 text-xs font-medium text-ink hover:bg-wash-press transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重新加载</span>
              </button>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-wash border border-line text-brand mb-4">
                <Sparkles className="w-8 h-8 opacity-70" />
              </div>
              <h4 className="text-base font-semibold text-ink mb-1.5">暂无生成素材</h4>
              <p className="text-xs text-ink-subtle max-w-sm mb-5 leading-relaxed">
                在左侧各大工作室生成图片、视频或音频后，系统将自动把每一张作品归档保存在此，随时管理与分类。
              </p>
              <button
                type="button"
                onClick={() => router.push('/studio')}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-info px-6 py-2.5 text-xs font-semibold text-ink-inverse shadow-elevation-2 shadow-[#22d3ee]/20 hover:opacity-95 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>前往工作室生图</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpenDetail={(a) => setDetailModal({ isOpen: true, asset: a })}
                    onCopyPrompt={() => showToast('提示词已复制到剪贴板')}
                    onRemix={handleRemix}
                    onMoveToFolder={(a) => setMoveModal({ isOpen: true, asset: a })}
                    onShareToCommunity={(a) => setShareModal({ isOpen: true, asset: a })}
                    onToggleFavorite={handleToggleFavorite}
                    onDelete={handleDeleteAsset}
                  />
                ))}
              </div>

              {/* 分页控制 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-8 pb-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-line bg-wash px-4 py-1.5 text-xs text-ink-muted hover:bg-wash-strong hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-ink-subtle">
                    第 <span className="text-ink font-medium">{page}</span> / {totalPages} 页
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl border border-line bg-wash px-4 py-1.5 text-xs text-ink-muted hover:bg-wash-strong hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 新建/重命名文件夹弹窗 */}
      <CreateFolderModal
        isOpen={createFolderModal.isOpen}
        onClose={() => setCreateFolderModal({ isOpen: false, parentFolder: null, editingFolder: null })}
        onSubmit={handleCreateOrUpdateFolder}
        parentFolder={createFolderModal.parentFolder}
        editingFolder={createFolderModal.editingFolder}
      />

      {/* 移动至文件夹弹窗 */}
      <MoveToFolderModal
        isOpen={moveModal.isOpen}
        onClose={() => setMoveModal({ isOpen: false, asset: null })}
        onMove={handleMoveConfirm}
        folderTree={folderTree}
        currentFolderId={moveModal.asset?.folder_id}
      />

      {/* 素材详情参数弹窗 */}
      <AssetDetailModal
        isOpen={detailModal.isOpen}
        asset={detailModal.asset}
        onClose={() => setDetailModal({ isOpen: false, asset: null })}
        onRemix={handleRemix}
        onShareToCommunity={(a) => setShareModal({ isOpen: true, asset: a })}
        onMoveToFolder={(a) => setMoveModal({ isOpen: true, asset: a })}
        onDelete={handleDeleteAsset}
      />

      {/* 分享至社区作品弹窗 (打通已有公开社区) */}
      {shareModal.isOpen && (
        <ShareToCommunityModal
          isOpen={shareModal.isOpen}
          onClose={() => setShareModal({ isOpen: false, asset: null })}
          creation={shareModal.asset}
          onSuccess={() => showToast('已成功发布至公开社区作品')}
        />
      )}

      {/* 浮动 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-line-accent/30 bg-canvas/95 px-4 py-2.5 text-xs font-medium text-ink shadow-elevation-4 shadow-black backdrop-blur-md animate-in slide-in-from-bottom-3 duration-base">
          ✨ {toastMessage}
        </div>
      )}
    </div>
  );
}
