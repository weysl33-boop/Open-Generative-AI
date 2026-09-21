'use client';

import { useState } from 'react';

// 第三方头像链接会过期（TikTok 签名 URL 带 x-expires），失败时浏览器会把 alt 文本
// 画进圆形头像框里；退回首字母，保持与无头像用户同一视觉。
export function UserAvatar({ src, alt, letter, className = 'size-full object-cover' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="select-none">{letter}</span>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
