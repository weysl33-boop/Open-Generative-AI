export const SOCIAL_LOGIN_PROVIDERS = Object.freeze({
  mainland_china: Object.freeze([
    Object.freeze({ id: 'wechat', available: true }),
    Object.freeze({ id: 'qq', available: true }),
    Object.freeze({ id: 'douyin', available: true }),
  ]),
  international: Object.freeze([
    Object.freeze({ id: 'google', available: true }),
    Object.freeze({ id: 'x', available: true }),
    Object.freeze({ id: 'tiktok', available: true }),
  ]),
});

export function getSocialLoginProviders(region) {
  return SOCIAL_LOGIN_PROVIDERS[region] || [];
}
