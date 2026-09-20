import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 相对 Location：nginx 未回传对外 Host，用 request.url 拼绝对地址会得到内网的
// localhost:3100，浏览器解析后就是一个打不开的地址。
export function GET() {
  return new NextResponse(null, { status: 302, headers: { location: '/account' } });
}
