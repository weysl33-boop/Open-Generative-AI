import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { guardScopedProxyRequest } from '@/lib/security/scopedProxyGuard';
import { PROXY_SCOPE } from '@/lib/security/legacyProxyPolicy';

const MUAPI_BASE = 'https://api.muapi.ai';

async function getApiKey(request) {
    // Client-supplied keys are accepted only when the explicit BYOK gate is open.
    return resolveProviderApiKey(request);
}

// Agent 代理此前把任意上游路径都用自己的密钥签名转发：登录用户因此可以以平台身份
// 读取账号类接口、并无限制消耗平台余额。现在按前端实际调用过的路径形状默认拒绝。
async function guardAgentProxy(request, user, pathSegments) {
    return guardScopedProxyRequest({ request, scope: PROXY_SCOPE.AGENTS, pathSegments, user });
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie'); // CRITICAL: Stop forwarding browser cookies to MuAPI
    headers.delete('authorization');
    headers.delete('x-api-key');
    return headers;
}

// Build the target URL without a trailing slash when path is empty.
// e.g. GET /api/agents?is_template=true  → https://api.muapi.ai/agents?is_template=true
// e.g. GET /api/agents/by-slug/foo       → https://api.muapi.ai/agents/by-slug/foo
function buildTargetUrl(pathSegments, search) {
    const path = pathSegments.join('/');
    const base = `${MUAPI_BASE}/agents`;
    return path ? `${base}/${path}${search}` : `${base}${search}`;
}

export async function GET(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const slug = await params;
    const pathSegments = slug.path || [];
    const blocked = await guardAgentProxy(request, user, pathSegments);
    if (blocked) return blocked;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Agent 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, { headers, method: 'GET' });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const blocked = await guardAgentProxy(request, user, pathSegments);
    if (blocked) return blocked;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Agent 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'POST', headers, body });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const blocked = await guardAgentProxy(request, user, pathSegments);
    if (blocked) return blocked;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Agent 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const response = await fetch(targetUrl, { method: 'DELETE', headers });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Agent 请求暂时不可用') }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    const guarded = guardMutation(request, { maxBytes: 512 * 1024 });
    if (guarded) return guarded;
    const slug = await params;
    const pathSegments = slug.path || [];
    const blocked = await guardAgentProxy(request, user, pathSegments);
    if (blocked) return blocked;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(pathSegments, search);

    const headers = cleanHeaders(request);
    const apiKey = await getApiKey(request);
    if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: 'Agent 服务暂未配置或不可用' }, { status: 503 });
    if (apiKey.key) headers.set('x-api-key', apiKey.key);

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, { method: 'PUT', headers, body });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: publicErrorMessage(error, 'Agent 请求暂时不可用') }, { status: 500 });
    }
}
