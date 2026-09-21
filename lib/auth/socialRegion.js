import 'server-only';

import { isChinaIp, resolveClientIp } from '../security/chinaIpBlock.js';

/**
 * Social login is split by the visitor's network IP, not locale or account profile.
 * Use the IP-range database only; country headers can be supplied by arbitrary clients.
 */
export function getSocialLoginRegion(headers) {
  const { ip } = resolveClientIp(headers);
  return isChinaIp(ip) ? 'mainland_china' : 'international';
}
