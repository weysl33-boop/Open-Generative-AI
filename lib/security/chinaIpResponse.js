import { NextResponse } from 'next/server';
import { renderForbiddenHtml, renderIcpNoticeHtml } from './chinaIpBlock.js';
import { gatePathname } from './chinaIpGate.js';

// 响应构造单独成文件：chinaIpGate 只留纯判定，Node 测试进程才能 import 它
// （`next/server` 在纯 Node 的 ESM 解析下不可用）。
function wantsHtml(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('application/xhtml') || accept === '' || accept === '*/*';
}

export function buildGateResponse(request, decision) {
  const pathname = gatePathname(request);
  const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'X-Robots-Tag': 'noindex, nofollow' };

  // 接口调用永远拿 JSON 403：给脚本喂 HTML 只会把它们变成一堆解析错误。
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'REGION_BLOCKED', message: 'Service is not available in your region.' },
      { status: 403, headers: noStore },
    );
  }

  if (decision.action === 'icp_notice') {
    return new NextResponse(renderIcpNoticeHtml(decision.customMessage), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStore },
    });
  }

  if (wantsHtml(request)) {
    return new NextResponse(renderForbiddenHtml(), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStore },
    });
  }

  return NextResponse.json(
    { error: 'REGION_BLOCKED', message: 'Service is not available in your region.' },
    { status: 403, headers: noStore },
  );
}
