import { NextResponse } from 'next/server';
import { getLocaleFromPathname, isSupportedLocale, normalizeLocale, SUPPORTED_LOCALES } from './lib/locales';
import { evaluateChinaIpGate } from './lib/security/chinaIpGate';
import { buildGateResponse } from './lib/security/chinaIpResponse';

function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy
    // style-src includes fonts.googleapis.com for Jost webfont
    // font-src includes fonts.gstatic.com for actual font files
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://turing.captcha.qcloud.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net/ https://turing.captcha.qcloud.com; frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.recaptcha.net/ https://turing.captcha.qcloud.com; font-src 'self' data: https://fonts.gstatic.com;"
    );
    // 强制 HTML 页面与动态 API 不被浏览器协商强缓存，防止版本发布后旧 HTML 错位
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    const gate = evaluateChinaIpGate(request);
    if (gate.blocked) {
        console.warn(
            `[chinaIpGate] 403 ${url.pathname} ip=${gate.clientIp} via=${gate.ipSource} action=${gate.action}`,
        );
        return addSecurityHeaders(buildGateResponse(request, gate));
    }

    let locale = getLocaleFromPathname(url.pathname);
    if (locale === 'en') {
        const queryLocale = url.searchParams.get('lang') || url.searchParams.get('locale');
        const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value || request.cookies.get('locale')?.value;
        const normalizedQueryLocale = normalizeLocale(queryLocale);
        const normalizedCookieLocale = normalizeLocale(cookieLocale);
        if (queryLocale && isSupportedLocale(queryLocale) && SUPPORTED_LOCALES.includes(normalizedQueryLocale)) {
            locale = normalizedQueryLocale;
        } else if (cookieLocale && isSupportedLocale(cookieLocale) && SUPPORTED_LOCALES.includes(normalizedCookieLocale)) {
            locale = normalizedCookieLocale;
        }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-locale', locale);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
    response.headers.set('x-locale', locale);
    return addSecurityHeaders(response);
}

// Match all paths for security headers. Exclude Next.js internal paths.
// `runtime: 'nodejs'` (Next 15.5 起稳定) 是中国大陆 IP 门禁的前提：
// 判定要读 data/ 与 lib/security/ 下的网段库和拦截配置镜像，Edge 运行时没有 fs。
export const config = {
    runtime: 'nodejs',
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};
