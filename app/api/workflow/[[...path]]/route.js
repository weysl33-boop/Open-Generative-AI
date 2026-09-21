import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { publicErrorMessage } from '@/lib/security/publicError';
import { guardMutation } from '@/lib/security/requestGuard';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { guardScopedProxyRequest } from '@/lib/security/scopedProxyGuard';
import { PROXY_SCOPE } from '@/lib/security/legacyProxyPolicy';

const MUAPI_BASE = 'https://api.muapi.ai';

async function getApiKey(request) {
    return resolveProviderApiKey(request);
}

// workflow 运行与 architect 在上游直接计费，此前既不鉴路径也不限流。
async function guardWorkflowProxy(request, user, pathSegments) {
    return guardScopedProxyRequest({ request, scope: PROXY_SCOPE.WORKFLOW, pathSegments, user });
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

    const blocked = await guardWorkflowProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Workflow 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });
        const data = await response.json();
        // Template workflows are an optional upstream capability. Normalize
        // the missing capability to a successful empty response so the client
        // can show its empty state without a noisy 404 request.
        if (path === 'get-template-workflows' && response.status === 404) {
            return NextResponse.json({ workflows: [] }, {
                status: 200,
                headers: { 'x-workflow-template-source': 'empty-upstream' },
            });
        }
        if (path.includes('get-workflow-def')) {
        }
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Workflow 请求暂时不可用') }, { status: 500 });
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

    const blocked = await guardWorkflowProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Workflow 服务暂未配置或不可用' }, { status: 503 });
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
        return NextResponse.json({ error: publicErrorMessage(error, 'Workflow 请求暂时不可用') }, { status: 500 });
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

    const blocked = await guardWorkflowProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Workflow 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Workflow 请求暂时不可用') }, { status: 500 });
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

    const blocked = await guardWorkflowProxy(request, user, pathSegments);
    if (blocked) return blocked;

    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/workflow/${path}${search}`;

    const headers = cleanHeaders(request);

    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Workflow 服务暂未配置或不可用' }, { status: 503 });
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
        return NextResponse.json({ error: publicErrorMessage(error, 'Workflow 请求暂时不可用') }, { status: 500 });
    }
}
