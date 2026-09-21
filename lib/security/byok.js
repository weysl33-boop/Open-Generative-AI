import 'server-only';

import { getServerProviderApiKey } from '../services/providerSecrets.js';

export function isByokEnabled() {
  return false;
}

export async function resolveProviderApiKey(request, serverKey, provider = 'muapi') {
  const configuredKey = serverKey === undefined
    ? await getServerProviderApiKey({ provider })
    : String(serverKey || '').trim() || null;
  return { ok: Boolean(configuredKey), key: configuredKey, managed: true };
}
