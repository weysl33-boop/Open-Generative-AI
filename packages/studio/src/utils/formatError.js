/**
 * Format API and studio error messages into clean, user-friendly strings.
 */

// A provider reports credit exhaustion against the platform's own upstream
// account; the platform reports a shortfall in the *user's* wallet, in
// Chinese, and never mentions its balance endpoint. Tagging the origin at the
// throw site would be more robust than matching text, but muapi.js truncates
// upstream bodies to 100 characters before they reach here, so the structural
// fields are usually gone by now and only the wording survives.
const PROVIDER_CREDIT_SIGNATURES = [
  'topup_url',
  'balance_endpoint',
  'insufficient credit balance',
];

function parseJsonPayload(message) {
  if (!message.includes('{') || !message.includes('}')) return null;
  try {
    return JSON.parse(message.slice(message.indexOf('{')));
  } catch {
    return null;
  }
}

function hasStatus(message, code) {
  return new RegExp(`(?:^|[^0-9])${code}(?:[^0-9]|$)`).test(message);
}

export function formatErrorMessage(err, fallback = "Generation failed") {
  if (!err) return fallback;
  let message = typeof err === 'string' ? err : (err.message || fallback);
  const lower = message.toLowerCase();

  // If message contains JSON payload (e.g. `API Request Failed: 402 Payment Required - {...}`)
  const data = parseJsonPayload(message);

  if (PROVIDER_CREDIT_SIGNATURES.some((signature) => lower.includes(signature))) {
    return "Generation is temporarily unavailable because our provider is out of capacity. Please try again later.";
  }

  if (data) {
    if (data.detail && typeof data.detail === 'string') {
      return data.detail;
    }
    if (data.error?.message && typeof data.error.message === 'string') {
      return data.error.message;
    }
    if (data.message && typeof data.message === 'string') {
      return data.message;
    }
  }

  // Handle common HTTP error codes
  if (hasStatus(message, '402') || lower.includes('insufficient_credits') || lower.includes('insufficient credits')) {
    return "Insufficient credits. Please top up your wallet.";
  }
  if (hasStatus(message, '401') || hasStatus(message, '403')) {
    return "Authentication failed. Please check your account session or API key.";
  }
  if (hasStatus(message, '429')) {
    return "Too many requests. Please wait a moment and try again.";
  }

  // Strip technical prefix like "API Request Failed: 500 Internal Server Error -"
  message = message.replace(/^API Request Failed: \d+ [^-]+ - /, '');

  return message.length > 150 ? message.slice(0, 147) + '...' : message;
}
