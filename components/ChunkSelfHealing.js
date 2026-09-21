'use client';

import { useEffect } from 'react';
import { reloadBypassingCache, trySpendReload } from '@/lib/client/reloadBudget';

export default function ChunkSelfHealing() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const trySelfHealing = (reason) => {
      // 预算与两个错误边界共用：以前三处各记各的时间戳，一次版本发布会让它们
      // 在 10s / 15s 的节奏上互相点燃，页面反复重载。
      if (!trySpendReload()) {
        console.warn('[ChunkSelfHealing] 本机 60s 内的自动重载已用尽，停在当前页面:', reason);
        return;
      }
      console.warn('[ChunkSelfHealing] 检测到静态资源版本错位或加载失败，正在自动拉取最新版本:', reason);
      reloadBypassingCache();
    };

    // 1. 捕获未处理的 Promise 拒绝 (例如动态 import() 失败导致的 ChunkLoadError)
    const handleRejection = (event) => {
      const error = event.reason;
      const message = String(error?.message || error || '');
      const isChunkError =
        message.includes('ChunkLoadError') ||
        message.includes('Loading chunk') ||
        message.includes('CSS_CHUNK_LOAD_FAILED') ||
        message.includes('failed to fetch') ||
        message.includes('Failed to load resource') ||
        (error?.name === 'ChunkLoadError');

      if (isChunkError) {
        event.preventDefault();
        trySelfHealing(`Promise rejection: ${message}`);
      }
    };

    // 2. 捕获全局脚本/样式标签加载失败事件 (例如 <script src="..."> 404/400)
    const handleError = (event) => {
      const target = event.target;
      const isScriptOrLink =
        target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK');
      const src = target?.src || target?.href || '';

      if (isScriptOrLink && (src.includes('/_next/static/') || src.includes('/_next/'))) {
        trySelfHealing(`Resource tag load error: ${src}`);
        return;
      }

      const message = String(event.message || '');
      if (
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError') ||
        message.includes('CSS_CHUNK_LOAD_FAILED')
      ) {
        trySelfHealing(`Window error: ${message}`);
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError, true); // 使用 capture 捕获资源标签加载失败

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError, true);
    };
  }, []);

  return null;
}
