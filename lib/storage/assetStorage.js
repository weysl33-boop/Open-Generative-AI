import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav']);

function sanitizeExtension(ext) {
  if (!ext) return 'png';
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_EXTENSIONS.has(clean) ? clean : 'png';
}

function detectExtensionFromBuffer(buf, fallbackExt = 'png') {
  if (!buf || buf.length < 4) return fallbackExt;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  return fallbackExt;
}

export async function persistCreationResult({
  url,
  creationId,
  mediaType = 'image',
  timeoutMs = 15000,
} = {}) {
  if (!url || typeof url !== 'string') return url;

  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('data:') || !trimmed.startsWith('http')) {
    return trimmed;
  }

  const safeId = (creationId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const uploadsBaseDir = process.env.STORAGE_LOCAL_DIR
    ? path.resolve(process.env.STORAGE_LOCAL_DIR)
    : path.join(process.cwd(), 'public', 'uploads', 'creations');
  const targetDir = path.join(uploadsBaseDir, yearMonth);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(trimmed, {
      headers: {
        'User-Agent': 'KoyoSimAssetSync/2.0 (+https://koyosim.com)',
        Accept: mediaType === 'video' ? 'video/*,application/octet-stream' : 'image/*,application/octet-stream',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[assetStorage] 上游媒体下载状态非200 (${response.status})，保留原始链接: ${trimmed}`);
      return trimmed;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 100) {
      console.warn(`[assetStorage] 上游媒体体积过小 (${buffer.length}b)，保留原始链接: ${trimmed}`);
      return trimmed;
    }
    if (buffer.length > 150 * 1024 * 1024) {
      console.warn(`[assetStorage] 上游媒体体积超出限制 (150MB)，保留原始链接: ${trimmed}`);
      return trimmed;
    }

    let ext = 'png';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('mp4')) ext = 'mp4';
    else {
      ext = detectExtensionFromBuffer(buffer, mediaType === 'video' ? 'mp4' : 'png');
    }

    ext = sanitizeExtension(ext);
    const fileName = `${safeId}.${ext}`;
    const filePath = path.join(targetDir, fileName);

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(filePath, buffer);

    const publicPrefix = process.env.STORAGE_PUBLIC_URL_PREFIX || '/uploads/creations';
    const relativeUrl = `${publicPrefix.replace(/\/$/, '')}/${yearMonth}/${fileName}`;

    return relativeUrl;
  } catch (error) {
    console.warn(`[assetStorage] 转存失败 (${error.name}: ${error.message})，保留原始链接: ${trimmed}`);
    return trimmed;
  }
}
