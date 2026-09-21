# Domestic social login setup

The application implements three independent mainland providers: WeChat Open Platform website login (`wechat`), QQ Connect website login (`qq`), and Douyin Open Platform website login (`douyin`). TikTok remains a separate international provider (`tiktok`). Do not reuse TikTok credentials or provider IDs for Douyin.

## Callback URLs

Use the public origin configured by `PUBLIC_APP_URL` (or the canonical public host):

```text
<PUBLIC_APP_URL>/api/auth/oauth/wechat/callback
<PUBLIC_APP_URL>/api/auth/oauth/qq/callback
<PUBLIC_APP_URL>/api/auth/oauth/douyin/callback
```

The exact full callback URL is also shown on each channel card under **Admin → 登录配置 → 登录方式与连通性 → 社交登录** (`/admin/login?category=social`). Register the callback with the matching provider application before testing.

## Provider setup

| Provider | Application type / permission | Credentials in the admin vault | Callback notes |
| --- | --- | --- | --- |
| WeChat | [Approved website application](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html); website login scope `snsapi_login` | AppID → `wechat_oauth:app_id`; AppSecret → `wechat_oauth:app_secret` | Register the callback hostname in WeChat Open Platform. This credential namespace is intentionally separate from WeChat Pay's `wechat` secrets. |
| QQ | [Approved QQ Connect website application](https://wiki.connect.qq.com/%E4%BD%BF%E7%94%A8authorization_code%E8%8E%B7%E5%8F%96access_token); `get_user_info` | App ID → `qq:app_id`; App Key → `qq:app_key` | Register the callback URL/domain with QQ Connect. |
| Douyin | [Approved Douyin website application](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission); `user_info` | Client Key → `douyin:client_key`; Client Secret → `douyin:client_secret` | Register the complete HTTPS callback URL in the Douyin developer console. Do not add query parameters to the callback URL. |

Enter credentials through each channel card's encrypted credential form. The database stores them using the existing AES-256-GCM provider-secret vault. Optional environment fallbacks are documented in `.env.example`; do not commit populated values or send secrets through chat.

## Verification

The channel's health probe checks that credentials exist and that the provider gateway is reachable; it deliberately does not claim that a secret pair is valid. A complete live acceptance test requires an approved provider application, exact callback registration, and a real user consent/authorization. Before those credentials are available, the OAuth exchange and profile mapping can be tested with mocked provider responses.

## Admin: one page for every login method

Social and SMS login (configuration **and** connectivity checks) live in a single admin submenu: **登录配置 → 登录方式与连通性** at `/admin/login`. Categories switch through the shared card rail (`SegmentedControl`), and each pill carries a status dot that reflects how many channels in that category are actually usable:

| Category | Deep link | What it manages | Connectivity check |
| --- | --- | --- | --- |
| 社交登录 | `/admin/login?category=social` | Domestic/overseas channel visibility per region | Per-channel credential + gateway probe |
| 短信登录 | `/admin/login?category=sms` | Provider keys, routing rules, captcha risk settings | Per-provider health probe, real test send, recent delivery logs |

Email SMTP is **not** a login tab: it has its own single settings page **系统集成 → 邮件发信设置** at `/admin/email`, which also carries send statistics and the per-message delivery log. See `docs/EMAIL_SENDING.md`.

The old pages (`/admin/providers/social`, `/admin/providers/sms`, `/admin/providers/email`) stay as redirect shims so bookmarks keep working — the first two preselect the right category, the email one lands on `/admin/email`. `/admin/providers/ai` is unchanged: it remains the only place to rotate env-based provider keys.

## Admin: region split for social login

Social channels are grouped by visitor region rather than listed flat:

- `mainland_china` → `wechat`, `qq`, `douyin`
- `international` → `google`, `x`, `tiktok`

Toggling **前台展示** per channel persists to the `social_login_display` system setting (`private` visibility) through `PUT /api/admin/login/social-regions`, which requires an `Idempotency-Key` and writes an audit entry. A submission must list every channel of every region — a partial payload is rejected instead of silently re-enabling the omitted ones. A channel that has no credentials recorded is never offered to visitors, whatever the switch says.

The frontend asks `GET /api/auth/social-options`, which resolves the visitor's region from `X-Real-IP` / `cf-connecting-ip` / `x-forwarded-for` via `isChinaIp` (the same APNIC range table that powers the mainland access gate) and returns only the channels that are both enabled for that region and configured. The response is `no-store` and varies on those headers, so no cache can leak one region's list into another's.

The diagnostics card at the top of the social category shows the IP the server actually saw, which header it came from, and which region that mapped to — with a warning when the header is missing, which means nginx is not forwarding `proxy_set_header X-Real-IP $remote_addr` and every visitor is being treated as overseas. The page also reports whether the mainland gate (`系统设置 → china_ip_block`) is currently on; the two features are independent, so region-based display keeps working after the gate is switched off.

