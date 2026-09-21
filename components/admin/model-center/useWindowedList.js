'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 目录规模可达 500+ 模型，一次渲染全部卡片会拖垮滚动；这里按窗口增量渲染，
 * 结果集变化时回到第一屏，触底哨兵自动续窗。
 */
export function useWindowedList(total, step) {
  const [limit, setLimit] = useState(step);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setLimit(step);
  }, [total, step]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || limit >= total) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((value) => value + step);
      },
      { rootMargin: '480px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, total, step]);

  return { limit, sentinelRef, revealMore: () => setLimit((value) => value + step) };
}
