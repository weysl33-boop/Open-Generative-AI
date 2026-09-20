'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, StatusBadge, Button as AdminUiButton } from '@/components/admin/AdminUi';
import StandardButton from '@/components/ui/button';
import LogoCropper from '@/components/admin/branding/LogoCropper';
import {
  Eye,
  Save,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Link as LinkIcon,
  Sliders,
  Crop,
  Layers,
  Flame,
  FolderOpen,
  Bot,
  Compass,
  ExternalLink,
  Workflow,
  Zap,
  Globe,
  Bell,
  UserRound,
} from 'lucide-react';

const Button = AdminUiButton || StandardButton || (({ children, className = '', ...props }) => (
  <button className={`inline-flex items-center justify-center rounded-lg px-4 py-2 font-medium transition ${className}`} {...props}>
    {children}
  </button>
));

const NAV_ICON_OPTIONS = [
  { id: 'flame', label: '火焰 (Flame)', icon: Flame },
  { id: 'folder', label: '作品夹 (Folder)', icon: FolderOpen },
  { id: 'workflow', label: '工作流 (Workflow)', icon: Workflow },
  { id: 'bot', label: '智能体 (Bot)', icon: Bot },
  { id: 'zap', label: '闪电 (Zap)', icon: Zap },
  { id: 'sparkles', label: '星芒 (Sparkles)', icon: Sparkles },
  { id: 'compass', label: '指南针 (Compass)', icon: Compass },
  { id: 'external', label: '外链 (External)', icon: ExternalLink },
  { id: 'none', label: '无图标', icon: null },
];

const QUICK_ROUTES = [
  { label: '核心工作室', path: '/studio' },
  { label: '即梦社区', path: '/community' },
  { label: '我的作品', path: '/creations' },
  { label: '工作流中心', path: '/studio/workflows' },
  { label: 'AI智能体', path: '/agents' },
  { label: '个人账户', path: '/account' },
  { label: '服务条款', path: '/terms' },
];

export default function BrandingManagerClient({
  initialBrand,
  initialNavigation,
  defaults,
}) {
  const [brand, setBrand] = useState({
    brandName: 'koyosim',
    brandSlogan: 'AI 创意工作室',
    logoType: 'image',
    logoUrl: '',
    logoIcon: 'layers',
    logoBgColor: '#22d3ee',
    logoTextColor: '#000000',
    logoHref: '/studio',
    logoTarget: '_self',
    showBrandName: true,
    ...initialBrand,
  });

  const [navigation, setNavigation] = useState(
    Array.isArray(initialNavigation) ? initialNavigation : defaults?.navigation || []
  );

  const [previewTheme, setPreviewTheme] = useState('dark'); // 'dark' | 'light'
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    setLogoLoadError(false);
  }, [brand.logoUrl]);

  // 裁剪与上传相关状态
  const fileInputRef = useRef(null);
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);

  // 导航项编辑模态框状态
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 处理本地图片选择
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择有效的图片文件 (PNG, JPG, WEBP, SVG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result);
      setIsCropping(true);
    };
    reader.readAsDataURL(file);
    // 清空 input 允许重复选相同文件
    e.target.value = '';
  };

  // 处理图片拖拽
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择有效的图片文件 (PNG, JPG, WEBP, SVG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result);
      setIsCropping(true);
    };
    reader.readAsDataURL(file);
  };

  // 确认裁剪并上传落盘
  const handleCropComplete = async ({ blob, dataUrl, width, height }) => {
    setIsCropping(false);
    setIsUploading(true);
    setFeedback({ type: '', message: '' });

    try {
      // 封装为 FormData 上传到管理端专用落盘接口
      const formData = new FormData();
      formData.append('file', blob, 'logo.png');

      const res = await fetch('/api/admin/content/branding/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message || '图片上传处理失败，已自动降级为内联存储');
      }

      // 成功获得静态落盘 URL
      setBrand((prev) => ({
        ...prev,
        logoType: 'image',
        logoUrl: json.data.url,
      }));

      setFeedback({
        type: 'success',
        message: `Logo 裁剪成功并已安全就绪 (${width}x${height}px)！请点击下方“保存全网发布”使全站生效。`,
      });
      setTimeout(() => setFeedback({ type: '', message: '' }), 5000);
    } catch (err) {
      console.warn('[BrandingManager] 上传落盘失败，使用 base64 降级:', err);
      // 容错降级：直接采用高质量 DataURL
      setBrand((prev) => ({
        ...prev,
        logoType: 'image',
        logoUrl: dataUrl,
      }));
      setFeedback({
        type: 'success',
        message: `Logo 裁剪已就绪！请点击下方“保存全网发布”使全站生效。`,
      });
    } finally {
      setIsUploading(false);
      setRawImageSrc(null);
    }
  };

  // 保存全网发布
  const handleSaveAll = async () => {
    setIsSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/admin/content/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          action: 'save',
          brand,
          navigation,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || '保存失败');
      }

      setBrand(data.data.brand);
      setNavigation(data.data.navigation);
      setFeedback({
        type: 'success',
        message: '🎉 网站 Logo 与导航配置已成功保存并向全站发布！',
      });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // 恢复默认配置
  const handleResetToDefault = async () => {
    if (!confirm('确定要将网站 Logo 和顶栏导航重置为系统出厂预设吗？当前未保存的自定义设置将被清空。')) {
      return;
    }

    setIsSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const res = await fetch('/api/admin/content/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ action: 'reset' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || '重置失败');
      }

      setBrand(data.data.brand);
      setNavigation(data.data.navigation);
      setFeedback({
        type: 'success',
        message: '已成功恢复系统官方默认配置！',
      });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // 导航项操作
  const toggleItemEnabled = (id) => {
    setNavigation((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const moveItemUp = (index) => {
    if (index <= 0) return;
    setNavigation((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      return copy.map((item, idx) => ({ ...item, order: idx + 1 }));
    });
  };

  const moveItemDown = (index) => {
    if (index >= prev.length - 1) return prev;
    setNavigation((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      return copy.map((item, idx) => ({ ...item, order: idx + 1 }));
    });
  };

  const removeItem = (id) => {
    setNavigation((prev) => prev.filter((item) => item.id !== id));
  };

  const handleOpenAddModal = () => {
    setEditingItem({
      id: `nav_${Date.now()}`,
      label: '新功能菜单',
      labelEn: 'New Feature',
      href: '/studio',
      icon: 'sparkles',
      iconColor: '#22d3ee',
      style: 'subtle',
      badge: 'NEW',
      enabled: true,
      target: '_self',
      order: navigation.length + 1,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem({ ...item });
    setIsModalOpen(true);
  };

  const handleSaveModalItem = () => {
    if (!editingItem) return;
    if (!editingItem.label.trim()) {
      alert('请输入菜单按钮标题');
      return;
    }
    if (!editingItem.href.trim()) {
      alert('请输入跳转路由链接');
      return;
    }

    setNavigation((prev) => {
      const exists = prev.some((i) => i.id === editingItem.id);
      if (exists) {
        return prev.map((i) => (i.id === editingItem.id ? editingItem : i));
      }
      return [...prev, editingItem];
    });
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-28">
      {/* 隐形文件选择器 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
      />

      {/* 头部标题与核心描述 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ImageIcon className="w-6 h-6 text-cyan-400" />
            网站 Logo 替换与顶栏管理
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            专注开箱即用的网站 Logo 替换工具，支持本地添加图像与智能裁剪，全站顶栏随时自适应生效。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleResetToDefault}
            disabled={isSaving}
            className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复默认配置
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={isSaving || isUploading}
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? '正在发布...' : '保存全网发布'}
          </Button>
        </div>
      </div>

      {/* 提示反馈栏 */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm transition-all duration-300 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 模块 1：全真 1:1 Live Header 实时顶栏仿真器 */}
      <Card className="border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">网站顶栏 1:1 真实渲染仿真器</h3>
            <span className="text-xs text-slate-500 hidden md:inline">所见即所得 · 与前台全站无缝同步</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-2">预览背景:</span>
            <button
              type="button"
              onClick={() => setPreviewTheme('dark')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                previewTheme === 'dark'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              暗夜模式 (标准)
            </button>
            <button
              type="button"
              onClick={() => setPreviewTheme('light')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                previewTheme === 'light'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              明亮模式
            </button>
          </div>
        </div>

        {/* 仿真画布容器 */}
        <div className="p-6 bg-slate-950/60 flex justify-center">
          <div
            className={`w-full max-w-5xl rounded-2xl border transition-all duration-300 px-6 py-3.5 flex items-center justify-between shadow-2xl ${
              previewTheme === 'dark'
                ? 'bg-slate-950 border-white/10 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* 左侧：自适应 Logo 与 品牌标题 */}
            <div className="flex items-center gap-3">
              {brand.logoUrl && !logoLoadError ? (
                <div className="h-8 max-w-[200px] flex items-center justify-center">
                  <img
                    src={brand.logoUrl}
                    alt={brand.brandName || 'Logo'}
                    className="h-full w-auto max-h-8 max-w-[200px] object-contain"
                    onError={() => setLogoLoadError(true)}
                  />
                </div>
              ) : (
                <div
                  className="size-8 rounded-lg flex items-center justify-center shadow-lg"
                  style={{
                    backgroundColor: brand.logoBgColor || '#22d3ee',
                    boxShadow: `0 4px 12px ${brand.logoBgColor || '#22d3ee'}33`,
                  }}
                >
                  <Layers className="size-4 text-black" />
                </div>
              )}

              {brand.showBrandName && (
                <span
                  className={`text-base font-bold tracking-tight font-jost ${
                    previewTheme === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {brand.brandName || 'koyosim'}
                </span>
              )}

              {/* 左侧全站固定纯文字导航预览 */}
              <div className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-3 border-l border-white/10 pl-2">
                <span className={`px-2 py-0.5 text-xs font-semibold ${previewTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  首页
                </span>
                <span className={`px-2 py-0.5 text-xs font-medium ${previewTheme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
                  社区
                </span>
              </div>
            </div>

            {/* 右侧：右上角固定图标功能区 (额度、提醒、语言切换、用户头像) */}
            <div className="flex items-center gap-2">
              {/* 额度 */}
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                <Zap className="size-3 text-cyan-400" />
                <span className="font-mono font-bold text-white text-[11px]">10</span>
                <span className="text-[9px] text-zinc-400">算力</span>
              </div>
              {/* 提醒 */}
              <div className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 relative">
                <Bell className="size-3.5" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-pink-500" />
              </div>
              {/* 语言 */}
              <div className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300">
                <Globe className="size-3.5" />
              </div>
              {/* 头像 */}
              <div className="size-7 rounded-full border border-white/20 bg-slate-800 text-cyan-300 text-xs font-bold flex items-center justify-center">
                A
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 模块 2：网站 Logo 替换工具（核心交互区） */}
      <Card className="border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-white">网站 Logo 替换工具</h2>
              <p className="text-xs text-slate-400">选择图片后将自动调出裁剪工具，支持 1:1 方形、3:1 横版或自由裁切</p>
            </div>
          </div>
          {brand.logoUrl && !isCropping && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
              自定义 Logo 已生效
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* 如果正在裁剪，展开 LogoCropper 工作台 */}
          {isCropping && rawImageSrc ? (
            <div className="space-y-3">
              <LogoCropper
                imageSrc={rawImageSrc}
                onCropComplete={handleCropComplete}
                onCancel={() => {
                  setIsCropping(false);
                  setRawImageSrc(null);
                }}
              />
            </div>
          ) : (
            /* 未处于裁剪时：展示当前 Logo 卡片 + 替换入口 */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* 当前在用 Logo 状态展示 */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">当前前台展示 Logo</span>
                  {brand.logoUrl ? (
                    logoLoadError ? (
                      <span className="text-xs text-amber-400 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" /> 图像加载异常
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 自定义图像
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-slate-500">系统官方默认</span>
                  )}
                </div>

                {/* 实际效果预览方盒 */}
                <div className="h-28 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-center p-4 relative group">
                  {brand.logoUrl ? (
                    logoLoadError ? (
                      <div className="flex flex-col items-center justify-center text-center px-4 py-2">
                        <AlertCircle className="w-6 h-6 text-amber-400 mb-1.5" />
                        <span className="text-xs text-amber-300 font-medium">Logo 图片无法加载或链接已失效</span>
                        <span className="text-[11px] text-slate-500 mt-1 max-w-[280px] truncate" title={brand.logoUrl}>
                          {brand.logoUrl}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={brand.logoUrl}
                        alt="Current Logo"
                        className="max-h-16 w-auto max-w-full object-contain"
                        onError={() => setLogoLoadError(true)}
                      />
                    )
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div
                        className="size-10 rounded-xl flex items-center justify-center shadow-lg"
                        style={{ backgroundColor: brand.logoBgColor || '#22d3ee' }}
                      >
                        <Layers className="size-5 text-black" />
                      </div>
                      <span className="text-base font-bold text-white font-jost">
                        {brand.brandName || 'koyosim'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>支持格式: PNG, JPG, WEBP, SVG</span>
                  {brand.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setBrand((prev) => ({ ...prev, logoUrl: '' }))}
                      className="text-rose-400 hover:text-rose-300 underline"
                    >
                      清除自定义 Logo (恢复默认)
                    </button>
                  )}
                </div>
              </div>

              {/* 上传与替换拖拽区 */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-950/40 border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group h-full min-h-[175px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                  {isUploading ? '正在处理上传...' : '点击添加图片 或 拖拽图片至此处'}
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 max-w-xs">
                  支持上传透明背景 PNG 或任意图片，添加后即可在可视画布中自由裁剪比例并即时生效
                </p>
                <button
                  type="button"
                  className="mt-3 px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition"
                >
                  选择本地文件
                </button>
              </div>
            </div>
          )}

          {/* 备选：手动粘贴图片外链（极简折叠） */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowManualUrl(!showManualUrl)}
              className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1.5 transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              {showManualUrl ? '收起外部链接输入' : '高级选项: 直接输入外部图片 URL 或 CDN 链接'}
            </button>

            {showManualUrl && (
              <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                <input
                  type="text"
                  placeholder="https://example.com/logo.png 或 /uploads/..."
                  value={brand.logoUrl}
                  onChange={(e) => setBrand((prev) => ({ ...prev, logoType: 'image', logoUrl: e.target.value }))}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (brand.logoUrl) {
                      setRawImageSrc(brand.logoUrl);
                      setIsCropping(true);
                    }
                  }}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <Crop className="w-3.5 h-3.5 mr-1" />
                  对此图裁剪
                </Button>
              </div>
            )}
          </div>

          {/* 网站适配微调（仅保留 3 个直观核心选项） */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 border-t border-slate-800">
            {/* 品牌名称 */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                品牌展示名称
              </label>
              <input
                type="text"
                value={brand.brandName}
                onChange={(e) => setBrand((prev) => ({ ...prev, brandName: e.target.value }))}
                placeholder="例如 koyosim"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">全站 SEO 标题与品牌标示文本</span>
            </div>

            {/* 是否在 Logo 旁显示品牌文字 */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                旁置品牌名称显示
              </label>
              <div className="flex items-center gap-3 h-9">
                <button
                  type="button"
                  onClick={() => setBrand((prev) => ({ ...prev, showBrandName: !prev.showBrandName }))}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    brand.showBrandName ? 'bg-cyan-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      brand.showBrandName ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs text-slate-300">
                  {brand.showBrandName ? '在 Logo 右侧显示文字' : '隐藏旁置文字 (图文一体标推荐)'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">若您的 Logo 已带有文字，建议关闭以防文字重复</span>
            </div>

            {/* Logo 点击跳转路由 */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Logo 点击跳转链接
              </label>
              <input
                type="text"
                value={brand.logoHref}
                onChange={(e) => setBrand((prev) => ({ ...prev, logoHref: e.target.value }))}
                placeholder="/studio"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">默认跳转工作室首页 `/studio`</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 模块 3：顶栏导航菜单配置 */}
      <Card className="border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              顶栏导航菜单与按钮管理
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">控制前台顶栏右侧菜单胶囊按钮，支持排序、开关与增删改</p>
          </div>

          <Button
            onClick={handleOpenAddModal}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            新增导航菜单项
          </Button>
        </div>

        <div className="p-5 space-y-3">
          {navigation.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              当前暂未配置导航菜单，点击右上角“新增导航菜单项”添加。
            </div>
          ) : (
            navigation.map((item, index) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-wrap items-center justify-between gap-3 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500 w-5 text-center">
                    {index + 1}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleItemEnabled(item.id)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      item.enabled ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                        item.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold">
                          {item.badge}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {item.href}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveItemUp(index)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 disabled:opacity-30"
                  >
                    <MoveUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItemDown(index)}
                    disabled={index === navigation.length - 1}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 disabled:opacity-30"
                  >
                    <MoveDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(item)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 底部悬浮操作发布栏 */}
      <div className="fixed bottom-6 left-0 right-0 z-40 max-w-4xl mx-auto px-4 pointer-events-none">
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>修改后请点击发布，变更将实时推送到全站前台。</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleResetToDefault}
              disabled={isSaving}
              className="text-xs border-slate-700 text-slate-300"
            >
              恢复默认
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={isSaving || isUploading}
              className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold text-xs px-5 shadow-lg shadow-cyan-500/20"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {isSaving ? '保存中...' : '保存全网发布'}
            </Button>
          </div>
        </div>
      </div>

      {/* 编辑/新增导航项模态框 */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">
                {navigation.some((i) => i.id === editingItem.id) ? '编辑导航菜单项' : '新增导航菜单项'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  菜单标题 (中文)
                </label>
                <input
                  type="text"
                  value={editingItem.label}
                  onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  placeholder="如: 即梦社区"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  跳转路由 (URL)
                </label>
                <input
                  type="text"
                  value={editingItem.href}
                  onChange={(e) => setEditingItem({ ...editingItem, href: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  placeholder="/community"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_ROUTES.map((qr) => (
                    <button
                      key={qr.path}
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, href: qr.path, label: qr.label })}
                      className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    右上角角标 (Badge)
                  </label>
                  <input
                    type="text"
                    value={editingItem.badge || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, badge: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    placeholder="HOT / NEW / 留空"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    展示胶囊样式
                  </label>
                  <select
                    value={editingItem.style || 'subtle'}
                    onChange={(e) => setEditingItem({ ...editingItem, style: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="subtle">低调微透 (推荐)</option>
                    <option value="gradient">渐变发光高亮</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveModalItem}
                className="px-5 py-2 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-black rounded-lg"
              >
                保存菜单项
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
