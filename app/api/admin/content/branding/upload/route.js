import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB，对于 Logo 完全足够且充裕

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

/**
 * 校验文件头部魔数，杜绝重命名可执行文件伪装上传
 */
function isValidMagicNumber(buffer, ext) {
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
  if (ext === '.svg') {
    const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8');
    const isSvgTag = /<svg[\s>]/i.test(head) || /<\?xml/i.test(head);
    const hasScript = /<script|javascript:|on\w+=/i.test(head);
    return isSvgTag && !hasScript;
  }
  return false;
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
      return errorResponse('VALIDATION_ERROR', '未检测到有效的图片文件', 400, guard.requestId);
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('VALIDATION_ERROR', '图片体积不能超过 5MB', 400, guard.requestId);
    }

    const originalName = String(file.name || 'logo.png');
    let ext = path.extname(originalName).toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      ext = file.type === 'image/webp' ? '.webp' : '.png';
    }

    const mime = String(file.type || '').toLowerCase();
    if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
      return errorResponse('VALIDATION_ERROR', `不支持的图片格式: ${mime}`, 400, guard.requestId);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!isValidMagicNumber(buffer, ext)) {
      return errorResponse('VALIDATION_ERROR', '图片文件内容损坏或非法格式', 400, guard.requestId);
    }

    // 写入 public/uploads/branding/
    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'branding');
    await fs.mkdir(uploadsDir, { recursive: true });

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const filename = `logo-${Date.now()}-${randomSuffix}${ext}`;
    const targetFilePath = path.join(uploadsDir, filename);

    await fs.writeFile(targetFilePath, buffer);

    const publicUrl = `/uploads/branding/${filename}`;

    return okResponse(
      {
        url: publicUrl,
        filename,
        size: buffer.length,
        ext,
      },
      guard.requestId
    );
  } catch (err) {
    console.error('[branding/upload] 写入异常:', err);
    return errorResponse('UPLOAD_FAILED', err?.message || '图片上传处理失败', 500, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
