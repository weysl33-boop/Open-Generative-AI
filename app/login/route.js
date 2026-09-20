import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 登录界面挂在 /account（它再跳到工作室的账户面板）上，但找回密码邮件、
// 支付回跳和用户收藏夹里普遍写死 /login；缺这条路由会让这些入口直接 404。
export function GET(request) {
  return NextResponse.redirect(new URL('/account', request.url), 302);
}
