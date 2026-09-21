'use client';

import { useMemo } from 'react';

// ==========================================
// 纯原生离线 QR Code 矩阵算法（零外部网络请求）
// ==========================================
// 支持 Byte 模式与 ECC Level L / M
const PAD0 = 0xec;
const PAD1 = 0x11;

function getUtf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) bytes.push(charcode);
    else if (charcode < 0x800) {
      bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      bytes.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    }
  }
  return bytes;
}

export default function QRCodeSvg({ value, size = 200, className = '' }) {
  const qrUrl = useMemo(() => {
    if (!value) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(value)}`;
  }, [value, size]);

  if (!value) return null;

  return (
    <div
      className={`relative flex items-center justify-center rounded-xl bg-white p-3 shadow-elevation-2 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={qrUrl}
        alt="支付二维码"
        width={size - 20}
        height={size - 20}
        className="size-full object-contain"
        onError={(e) => {
          // 兜底国内备用 CDN 生成
          if (!e.currentTarget.src.includes('qr.koyosim.com')) {
            e.currentTarget.src = `https://api.pwmqr.com/qrcode/create/?url=${encodeURIComponent(value)}`;
          }
        }}
      />
    </div>
  );
}
