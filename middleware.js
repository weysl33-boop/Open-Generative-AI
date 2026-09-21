import { NextResponse } from 'next/server';
import { getLocaleConfig, getLocaleFromPathname, isSupportedLocale, matchPathLocale, normalizeLocale, SUPPORTED_LOCALES } from './lib/locales';
import { evaluateChinaIpGate } from './lib/security/chinaIpGate';
import { buildGateResponse } from './lib/security/chinaIpResponse';

/**
 * 语言前缀只允许一个规范写法。`/ja/studio`、`/zh-CN/studio`、`/es-ES/studio`、
 * `/en/studio` 今天都能正常渲染 —— 也就是说同一个页面有多个可收录的 URL。
 * 这些别名会被 `app/[locale]/...` 静态解析掉，永远走不到兜底页，所以收敛必须放在
 * 这一层：308 到注册表的 rootPath，其余部分与查询串原样保留。
 *
 * Location 的 origin 只能来自 PUBLIC_APP_URL，不能来自请求：`request.nextUrl.origin` 是
 * 服务自己的监听地址（`http://localhost:3100`），Next 既不读 Host 也不读 X-Forwarded-Host，
 * 而相对形式的 Location 又过不了 NextResponse 这一关（2026-09-21 实测直接抛
 * `ERR_INVALID_URL`）—— 于是线上每个别名跳转会把用户送进一个打不开的 localhost，
 * 且 308 可缓存，一旦被浏览器记住就再也回不来。PUBLIC_APP_URL 未配时兜到唯一对外域名。
 */
const CANONICAL_ORIGIN = String(process.env.PUBLIC_APP_URL || 'https://www.koyosim.com')
    .trim()
    .replace(/\/+$/, '');

function canonicalizeLocalePrefix(url) {
    const code = matchPathLocale(url.pathname);
    if (!code) return null;
    const asserted = `/${url.pathname.split('/')[1]}`;
    const canonical = getLocaleConfig(code).rootPath;
    if (asserted === canonical) return null;
    const rest = url.pathname.slice(asserted.length);
    return NextResponse.redirect(`${CANONICAL_ORIGIN}${canonical}${rest === '/' ? '' : rest}${url.search}`, 308);
}

// 只有"内容会随发版变化、又没有扩展名可判别"的两类响应必须禁缓存：HTML 与 /api。
// 带扩展名的路径（/robots.txt、/flags/*.svg、/uploads/**.png）不再被无条件刷成 no-store
// —— 刷了之后每一次开口都回源，处理器自己写的缓存策略等于没写。
// 注意这只拿回"允许缓存"的一半：app/uploads/[...path]/route.js 声明的是
// public, max-age=2592000, immutable，而 Next 对动态 Route Handler 的响应自己钉上
// public, max-age=0（2026-09-21 本地产物与线上同测一致），要真正 30 天不回访得另改。
const ASSET_EXTENSION = /\.[a-z0-9]+$/;

function mustNotCache(pathname) {
    return pathname.startsWith('/api') || !ASSET_EXTENSION.test(pathname);
}

function addSecurityHeaders(response, noStore = true) {
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
    if (noStore) {
        response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        response.headers.set('Pragma', 'no-cache');
    }
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

    // 别名前缀在语言判定之前收敛：否则 /ja/studio 会带着 x-locale=ja-JP 渲染出
    // 第二个可被收录的 URL，规范 URL 反而永远等不到那次 308。
    const canonical = canonicalizeLocalePrefix(url);
    if (canonical) return addSecurityHeaders(canonical);

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
    // 403 提示页与 308 上面那两条永远 no-store：它们不是内容响应，缓存住只会让
    // 门禁和收敛各自失效一个用户。只有这里放行的正常响应才分扩展名。
    return addSecurityHeaders(response, mustNotCache(url.pathname));
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
