'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, Heart, WandSparkles, MessageCircle, Share2, Shield, EyeOff, Hash, UserPlus, UserCheck, Calendar, ArrowLeft } from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ActivityTab from '@/components/account/tabs/ActivityTab';
import CommunityDetailModal from '@/components/community/CommunityDetailModal';
import AuthModal from '@/components/AuthModal';

export default function UserProfileClient({ creator }) {
  const [activeTab, setActiveTab] = useState('creations'); // 'creations' | 'activity'
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(creator.followersCount || 0);
  const [followBusy, setFollowBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(''), 3000);
  };

  // 1. 获取当前登录用户与关注状态
  useEffect(() => {
    async function initUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          setCurrentUser(json.user);
          if (json.user && json.user.id !== creator.id) {
            const followRes = await fetch(`/api/user/follow?targetUserId=${creator.id}`);
            if (followRes.ok) {
              const followData = await followRes.json();
              setIsFollowing(Boolean(followData.isFollowing));
            }
          }
        }
      } catch {}
    }
    initUser();
  }, [creator.id]);

  // 2. 加载该创作者已发布的社区作品
  const fetchPosts = useCallback(async () => {
    try {
      setLoadingPosts(true);
      const res = await fetch(`/api/community/posts?userId=${creator.id}&limit=50`);
      if (res.ok) {
        const json = await res.json();
        setPosts(json.posts || []);
      }
    } catch (err) {
      console.error('加载作品列表失败:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [creator.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // 3. 处理关注/取消关注
  const handleToggleFollow = async () => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    if (currentUser.id === creator.id) {
      showToast('无法关注自己');
      return;
    }
    setFollowBusy(true);
    try {
      const res = await fetch('/api/user/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: creator.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsFollowing(data.following);
        setFollowersCount((prev) => (data.following ? prev + 1 : Math.max(0, prev - 1)));
        showToast(data.following ? '已成功关注该创作者' : '已取消关注');
      } else {
        showToast(data.error || '操作失败');
      }
    } catch {
      showToast('网络连接异常');
    } finally {
      setFollowBusy(false);
    }
  };

  const isOwner = currentUser && currentUser.id === creator.id;
  const isActivityHiddenForViewer = !isOwner && creator.isActivityPublic === false;

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      {/* 顶部导航 */}
      <StudioHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {/* 返回上级 */}
        <div className="mb-6">
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>返回社区大厅</span>
          </Link>
        </div>

        {/* 创作者头部 Profile Banner 卡片 */}
        <div className="relative rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-elevation-3 overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-success-soft rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-5">
              {/* 头像 */}
              <div className="size-20 sm:size-24 rounded-full overflow-hidden bg-overlay border-2 border-line flex items-center justify-center text-2xl font-bold text-success shrink-0 shadow-inner">
                {creator.avatarUrl ? (
                  <img src={creator.avatarUrl} alt={creator.displayName} className="size-full object-cover" />
                ) : (
                  <span>{creator.displayName?.slice(0, 1).toUpperCase()}</span>
                )}
              </div>

              {/* 昵称、UID与简介 */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
                    {creator.displayName}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono border border-success-line bg-success-soft text-success">
                    <Hash className="size-3" />
                    UID: {creator.userNumber}
                  </span>
                  {isOwner && (
                    <span className="px-2 py-0.5 rounded-full text-micro font-semibold bg-wash-press text-ink border border-line">
                      我自己的主页
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs sm:text-sm text-ink max-w-xl leading-relaxed">
                  {creator.bio || '这位创作者很神秘，还没有填写个人简介。'}
                </p>

                {/* 粉丝与关注数 */}
                <div className="mt-3.5 flex items-center gap-5 text-xs text-ink-muted">
                  <div>
                    <span className="font-semibold text-ink font-mono">{followersCount}</span> 粉丝
                  </div>
                  <div>
                    <span className="font-semibold text-ink font-mono">{creator.followingCount}</span> 关注
                  </div>
                  <div className="text-[11px] text-ink-subtle flex items-center gap-1">
                    <Calendar className="size-3" />
                    <span>加入于 {new Date(creator.createdAt || Date.now()).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 关注按钮 */}
            {!isOwner && (
              <Button
                type="button"
                variant={isFollowing ? 'secondary' : 'primary'}
                size="md"
                disabled={followBusy}
                onClick={handleToggleFollow}
                className={`rounded-full px-5 text-xs font-semibold shrink-0 cursor-pointer ${
                  isFollowing
                    ? 'border-line bg-wash-strong text-ink hover:bg-danger-soft hover:text-danger hover:border-danger-line'
                    : 'bg-surface-inverse text-ink-on-accent hover:bg-surface-inverse'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="size-3.5 mr-1.5" />
                    已关注
                  </>
                ) : (
                  <>
                    <UserPlus className="size-3.5 mr-1.5" />
                    关注创作者
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Tab 导航切换栏 */}
        <div className="flex items-center gap-2 border-b border-line mb-6 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('creations')}
            className={`pb-3 text-sm font-medium transition-colors cursor-pointer relative ${
              activeTab === 'creations'
                ? 'text-ink font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>我的创作 ({posts.length})</span>
            {activeTab === 'creations' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-success rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`pb-3 text-sm font-medium transition-colors cursor-pointer relative ml-4 flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'text-ink font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>创作活跃度</span>
            {isActivityHiddenForViewer && (
              <EyeOff className="size-3 text-warning" title="该创作者已对外隐藏活跃度" />
            )}
            {activeTab === 'activity' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-success rounded-full" />
            )}
          </button>
        </div>

        {/* Tab 内容 1: 我的创作 */}
        {activeTab === 'creations' && (
          <div>
            {loadingPosts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] rounded-xl bg-wash animate-pulse" />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="size-16 rounded-full bg-wash flex items-center justify-center text-ink-subtle mb-3">
                  <Sparkles className="size-8 text-ink-subtle" />
                </div>
                <p className="text-sm font-medium text-ink">暂无公开作品</p>
                <p className="text-xs text-ink-subtle mt-1">创作者尚未将作品发布到社区大厅。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {posts.map((post) => (
                  <Card
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className="group rounded-xl border border-line bg-surface overflow-hidden shadow-elevation-1 hover:border-line-strong transition-all cursor-pointer p-0 flex flex-col"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-scrim">
                      {post.media_type === 'video' ? (
                        <video
                          src={post.media_url}
                          className="size-full object-cover group-hover:scale-105 transition-transform duration-page"
                        />
                      ) : (
                        <img
                          src={post.media_url}
                          alt={post.title}
                          className="size-full object-cover group-hover:scale-105 transition-transform duration-page"
                        />
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-micro font-medium bg-scrim backdrop-blur-md text-ink border border-line">
                        {post.model_name || 'AI 模型'}
                      </div>
                    </div>
                    <div className="p-3.5 flex flex-col gap-1.5 flex-1 justify-between">
                      <p className="text-xs font-semibold text-ink truncate">{post.title}</p>
                      <div className="flex items-center justify-between text-[11px] text-ink-muted pt-1">
                        <span className="flex items-center gap-1">
                          <Heart className="size-3 text-danger fill-current" />
                          <span>{post.likes_count || 0}</span>
                        </span>
                        <span>{new Date(post.created_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 内容 2: 创作活跃度 (支持隐私隐藏) */}
        {activeTab === 'activity' && (
          <div>
            {isActivityHiddenForViewer ? (
              // 创作者对外隐藏活跃记录 (对外使用我的创作)
              <div className="rounded-2xl border border-line bg-surface p-12 text-center flex flex-col items-center justify-center">
                <div className="size-12 rounded-full bg-wash border border-line flex items-center justify-center text-warning mb-3">
                  <EyeOff className="size-6" />
                </div>
                <h3 className="text-base font-semibold text-ink">创作者已将活跃面板设为私密</h3>
                <p className="text-xs text-ink-muted mt-1 max-w-md leading-relaxed">
                  为保护创作隐私，该创作者开启了活跃记录隐藏设置。您可以浏览其公开发布在「我的创作」中的作品展。
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('creations')}
                  className="mt-5 rounded-full px-5 text-xs font-semibold cursor-pointer"
                >
                  浏览全部公开作品
                </Button>
              </div>
            ) : (
              <div>
                {isOwner && creator.isActivityPublic === false && (
                  <div className="mb-4 p-3 rounded-xl border border-warning-line bg-warning-soft text-warning text-xs flex items-center gap-2">
                    <EyeOff className="size-4 shrink-0" />
                    <span>提示：您已开启「对外隐藏活跃记录」，此面板当前仅您本人可见，普通访客将无法查看。</span>
                  </div>
                )}
                <ActivityTab user={creator} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* 社区作品详情弹窗 */}
      {selectedPost && (
        <CommunityDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          currentUser={currentUser}
        />
      )}

      {/* 登录/注册弹窗 */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            try {
              const res = await fetch('/api/auth/me');
              if (res.ok) {
                const json = await res.json();
                setCurrentUser(json.user);
              }
            } catch {}
          }}
        />
      )}

      {/* 浮动 Toast 提示 */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full border border-line-strong bg-overlay/95 px-5 py-2 text-xs font-medium text-ink shadow-elevation-4 backdrop-blur-md animate-in fade-in slide-in-from-top-2"
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
