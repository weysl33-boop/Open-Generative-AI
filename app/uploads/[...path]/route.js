import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const pathSegments = resolvedParams?.path;

    if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // 防止路径穿越
    for (const segment of pathSegments) {
      if (!segment || segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const uploadsBase = path.resolve(process.cwd(), 'public', 'uploads');
    const targetFile = path.resolve(uploadsBase, ...pathSegments);

    // 严苛验证：目标路径必须位于 uploadsBase 之下
    if (!targetFile.startsWith(uploadsBase + path.sep) && targetFile !== uploadsBase) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    let stat;
    try {
      stat = await fs.stat(targetFile);
    } catch {
      return new NextResponse('Not Found', { status: 404 });
    }

    if (!stat.isFile()) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const fileBuffer = await fs.readFile(targetFile);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    });
  } catch (err) {
    console.error('[uploads/route] 读取静态文件失败:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function HEAD(request, context) {
  const res = await GET(request, context);
  return new NextResponse(null, {
    status: res.status,
    headers: res.headers,
  });
}
