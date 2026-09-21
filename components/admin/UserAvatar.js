'use client';

import { useEffect, useRef, useState } from 'react';

// 第三方头像链接会过期（TikTok 签名 URL 带 x-expires），失败时浏览器会把 alt 文本
// 画进圆形头像框里；退回首字母，保持与无头像用户同一视觉。
// 服务端直出的 <img> 常在 React 挂上 onError 之前就已失败，而浏览器不会重放 error
// 事件，所以挂载后还要自己读一次 complete/naturalWidth。
export function UserAvatar({ src, alt, letter, className = 'size-full object-cover' }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) return <span className="select-none">{letter}</span>;
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
