import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';

const MUAPI_BASE = 'https://api.muapi.ai';

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('authorization');
    headers.delete('x-api-key');
    return headers;
}

export async function GET(request) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const apiKey = await resolveProviderApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: '上传服务暂未配置或不可用' }, { status: 503 });

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/get_file_upload_url${search}`;

    const headers = cleanHeaders(request);
    headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '上传地址服务暂时不可用') }, { status: 500 });
    }
}

