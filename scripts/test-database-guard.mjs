function parseUrl(value, variableName) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${variableName} is required.`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${variableName} must use the postgres:// or postgresql:// scheme.`);
  }
  return parsed;
}

function targetKey(parsed) {
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim().toLowerCase();
  return [parsed.protocol.toLowerCase(), parsed.hostname.toLowerCase(), parsed.port || '5432', databaseName].join('|');
}

export function requireIsolatedTestDatabase(testValue, applicationValue = '', variableName = 'TEST_DATABASE_URL') {
  const testUrl = parseUrl(testValue, variableName);
  const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\/+/, '')).trim();
  if (!/(^|[_-])test(?:\d+)?($|[_-])/i.test(databaseName)) {
    throw new Error(`${variableName} must target a database with an explicit test name.`);
  }
  const applicationRaw = String(applicationValue || '').trim();
  if (applicationRaw) {
    const applicationUrl = parseUrl(applicationRaw, 'DATABASE_URL');
    if (targetKey(applicationUrl) === targetKey(testUrl)) {
      throw new Error(`${variableName} must not target the same database as DATABASE_URL.`);
    }
  }
  return testUrl;
}
