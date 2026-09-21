import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { validateUploadProxyTarget, isBlockedFileType } from '../../../../src/lib/uploadProxyTarget';
import { guardMutation } from '../../../../lib/security/requestGuard';
import { publicErrorMessage } from '../../../../lib/security/publicError';

export async function POST(request) {
    try {
        const guarded = guardMutation(request, { maxBytes: 25 * 1024 * 1024 });
        if (guarded) return guarded;
        const user = await getUserFromRequest(request);
        if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

        const formData = await request.formData();

        // Extract the original S3 target URL
        const targetUrl = formData.get('x-proxy-target-url');

        if (!targetUrl) {
            return NextResponse.json({ error: 'Missing proxy target URL' }, { status: 400 });
        }

        const validatedTarget = validateUploadProxyTarget(targetUrl);
        if (!validatedTarget.ok) {
            return NextResponse.json(
                { error: 'Invalid upload target', reason: validatedTarget.reason },
                { status: 400 }
            );
        }

        // Validate file content type and extension to prevent dangerous uploads (e.g. HTML, SVG, executables)
        const fileContentType = formData.get('Content-Type') || formData.get('content-type') || '';
        const keyName = formData.get('key') || '';
        
        for (const [key, value] of formData.entries()) {
            if (value && typeof value === 'object' && typeof value.name === 'string') {
                if (isBlockedFileType(value.name, value.type || fileContentType)) {
                    return NextResponse.json(
                        { error: 'Invalid file type', reason: 'blocked_file_type' },
                        { status: 400 }
                    );
                }
            }
        }

        if (isBlockedFileType(keyName, fileContentType)) {
            return NextResponse.json(
                { error: 'Invalid file type', reason: 'blocked_file_type' },
                { status: 400 }
            );
        }

        const s3FormData = new FormData();
        for (const [key, value] of formData.entries()) {
            if (key !== 'x-proxy-target-url') {
                s3FormData.append(key, value);
            }
        }

        const s3Response = await fetch(validatedTarget.url, {
            method: 'POST',
            body: s3FormData,
        });

        if (s3Response.ok || s3Response.status === 204) {
            return new Response(null, { status: 204 });
        } else {
            await s3Response.arrayBuffer().catch(() => {});
            console.error('S3 Proxy Error:', { status: s3Response.status });
            return NextResponse.json({ error: '上传服务暂时不可用' }, { status: s3Response.status });
        }
    } catch (error) {
        console.error('Upload Proxy Exception:', error);
        return NextResponse.json({ error: publicErrorMessage(error, '上传服务暂时不可用') }, { status: 500 });
    }
}

