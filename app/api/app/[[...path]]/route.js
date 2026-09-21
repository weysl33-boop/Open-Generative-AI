import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { guardScopedProxyRequest } from '@/lib/security/scopedProxyGuard';
import { PROXY_SCOPE } from '@/lib/security/legacyProxyPolicy';

const MUAPI_BASE = 'https://api.muapi.ai';

async function getApiKey(request) {
    return resolveProviderApiKey(request);
}

// 每个方法在处理前先过一遍上游路径白名单与限流。
async function guardAppProxy(request, user, pathSegments, method) {
    return guardScopedProxyRequest({ request, scope: PROXY_SCOPE.APP, pathSegments, method, user });
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie'); // CRITICAL: Stop forwarding browser cookies to MuAPI to avoid auth conflicts
    headers.delete('authorization');
    headers.delete('x-api-key');
    return headers;
}

export async function GET(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const blocked = await guardAppProxy(request, user, pathSegments, 'GET');
    if (blocked) return blocked;
    
    // Handle alias: get_upload_file -> get_file_upload_url
    const effectivePath = path === 'get_upload_file' ? 'get_file_upload_url' : path;
    
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'App 服务暂未配置或不可用' }, { status: 503 });
    if (effectivePath === 'get_file_upload_url' && !apiKey.key) {
        return NextResponse.json({ error: 'Unauthorized: Missing API key' }, { status: 401 });
    }

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/${effectivePath}${search}`;

    const headers = cleanHeaders(request);

    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        // SPECIAL CASE: Intercept upload URL and redirect to local binary proxy
        if (effectivePath === 'get_file_upload_url' && data.url) {
            const originalS3Url = data.url;
            // We pass the real S3 URL as a header to our proxy
            data.url = `/api/upload-binary`;
            
            // Store target in a temporary way? 
            // Better: Return the target URL as an extra field that our proxy will look for
            data.fields = {
                ...data.fields,
                'x-proxy-target-url': originalS3Url
            };
        }

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '应用请求暂时不可用') }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const blocked = await guardAppProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'App 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '应用请求暂时不可用') }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const blocked = await guardAppProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'App 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '应用请求暂时不可用') }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const blocked = await guardAppProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'App 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'PUT',
            headers,
            body
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, '应用请求暂时不可用') }, { status: 500 });
    }
}
