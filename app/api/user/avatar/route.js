import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getUserFromRequest, json } from '@/lib/services/auth';
import { saveUserAvatar } from '@/lib/services/profile';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function isValidImageMagicNumber(buffer, ext) {
  if (buffer.length < 4) return false;
  const hex = buffer.subarray(0, 4).toString('hex').toLowerCase();

  if (ext === '.png') {
    return hex === '89504e47';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return hex.startsWith('ffd8ff');
  }
  if (ext === '.webp') {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.length >= 12 ? buffer.subarray(8, 12).toString('ascii') : '';
    return riff === 'RIFF' && webp === 'WEBP';
  }
  if (ext === '.gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  return false;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录后再上传头像' }, { status: 401 });
  }

  const guarded = guardMutation(request, { maxBytes: 6 * 1024 * 1024 });
  if (guarded) return guarded;

  try {
    const formData = await request.formData();
    const file = formData.get('file') || formData.get('avatar');

    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
      return json({ error: '未检测到有效的图片文件' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return json({ error: '头像图片大小不能超过 5MB' }, { status: 400 });
    }

    const originalName = String(file.name || 'avatar.png');
    let ext = path.extname(originalName).toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      ext = file.type === 'image/webp' ? '.webp' : file.type === 'image/jpeg' ? '.jpg' : '.png';
    }

    const mime = String(file.type || '').toLowerCase();
    if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
      return json({ error: `不支持的图片格式: ${mime}` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!isValidImageMagicNumber(buffer, ext)) {
      return json({ error: '图片文件已损坏或非真实图片内容' }, { status: 400 });
    }

    // 存储目录: public/uploads/avatars/
    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'avatars');
    await fs.mkdir(uploadsDir, { recursive: true });

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const safeUserId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `avatar-${safeUserId}-${Date.now()}-${randomSuffix}${ext}`;
    const targetFilePath = path.join(uploadsDir, filename);

    await fs.writeFile(targetFilePath, buffer);

    const publicUrl = `/uploads/avatars/${filename}`;

    // 更新数据库 users.avatar_url
    const updatedUser = await saveUserAvatar(user.id, publicUrl);

    return json({
      success: true,
      avatarUrl: publicUrl,
      user: updatedUser,
      message: '头像更新成功',
    });
  } catch (err) {
    console.error('[user/avatar upload error]', err);
    return json({ error: '头像上传处理异常，请稍后重试' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录' }, { status: 401 });
  }

  try {
    const updatedUser = await saveUserAvatar(user.id, null);

    return json({
      success: true,
      avatarUrl: null,
      user: updatedUser,
      message: '已恢复系统默认头像',
    });
  } catch (err) {
    console.error('[user/avatar delete error]', err);
    return json({ error: '重置头像失败' }, { status: 500 });
  }
}
