# Domestic social login setup

The application implements three independent mainland providers: WeChat Open Platform website login (`wechat`), QQ Connect website login (`qq`), and Douyin Open Platform website login (`douyin`). TikTok remains a separate international provider (`tiktok`). Do not reuse TikTok credentials or provider IDs for Douyin.

## Callback URLs

Use the public origin configured by `PUBLIC_APP_URL` (or the canonical public host):

```text
<PUBLIC_APP_URL>/api/auth/oauth/wechat/callback
<PUBLIC_APP_URL>/api/auth/oauth/qq/callback
<PUBLIC_APP_URL>/api/auth/oauth/douyin/callback
```

The exact full callback URL is also shown on each channel card under **Admin → Integrations → Social Login**. Register the callback with the matching provider application before testing.

## Provider setup

| Provider | Application type / permission | Credentials in the admin vault | Callback notes |
| --- | --- | --- | --- |
| WeChat | [Approved website application](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html); website login scope `snsapi_login` | AppID → `wechat_oauth:app_id`; AppSecret → `wechat_oauth:app_secret` | Register the callback hostname in WeChat Open Platform. This credential namespace is intentionally separate from WeChat Pay's `wechat` secrets. |
| QQ | [Approved QQ Connect website application](https://wiki.connect.qq.com/%E4%BD%BF%E7%94%A8authorization_code%E8%8E%B7%E5%8F%96access_token); `get_user_info` | App ID → `qq:app_id`; App Key → `qq:app_key` | Register the callback URL/domain with QQ Connect. |
| Douyin | [Approved Douyin website application](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission); `user_info` | Client Key → `douyin:client_key`; Client Secret → `douyin:client_secret` | Register the complete HTTPS callback URL in the Douyin developer console. Do not add query parameters to the callback URL. |

Enter credentials through each channel card's encrypted credential form. The database stores them using the existing AES-256-GCM provider-secret vault. Optional environment fallbacks are documented in `.env.example`; do not commit populated values or send secrets through chat.

## Verification

The channel's health probe checks that credentials exist and that the provider gateway is reachable; it deliberately does not claim that a secret pair is valid. A complete live acceptance test requires an approved provider application, exact callback registration, and a real user consent/authorization. Before those credentials are available, the OAuth exchange and profile mapping can be tested with mocked provider responses.
