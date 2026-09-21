import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const REGION_BY_CALLING_CODE = Object.freeze({
  '+1': 'US',
  '+44': 'GB',
  '+49': 'DE',
  '+61': 'AU',
  '+65': 'SG',
  '+81': 'JP',
  '+82': 'KR',
  '+852': 'HK',
  '+853': 'MO',
  '+86': 'CN',
  '+886': 'TW',
});

function cleanCallingCode(value) {
  const input = String(value || '+86').trim();
  return input.startsWith('+') ? input : `+${input}`;
}

function parseInput(phone, countryCode = '+86') {
  const input = String(phone || '').trim();
  if (!input) return null;

  if (input.startsWith('+')) return parsePhoneNumberFromString(input);
  if (/^00\d/.test(input)) return parsePhoneNumberFromString(`+${input.slice(2)}`);

  const callingCode = cleanCallingCode(countryCode);
  const region = REGION_BY_CALLING_CODE[callingCode];
  if (!region) {
    throw Object.assign(new Error('暂不支持该国家或地区的手机号'), { code: 'UNSUPPORTED_COUNTRY' });
  }

  const local = parsePhoneNumberFromString(input, region);
  if (local?.isValid()) return local;

  // People often paste an international number without its leading plus.
  const international = parsePhoneNumberFromString(`+${input}`);
  if (international?.isValid() && `+${international.countryCallingCode}` === callingCode) {
    return international;
  }
  return local || international || null;
}

export function normalizePhone(phone, countryCode = '+86') {
  const parsed = parseInput(phone, countryCode);
  if (!parsed || !parsed.isValid() || !parsed.number.startsWith('+')) {
    throw Object.assign(new Error('请输入有效的手机号码'), { code: 'INVALID_PHONE' });
  }
  return {
    e164: parsed.number,
    country: parsed.country || 'ZZ',
    callingCode: `+${parsed.countryCallingCode}`,
    nationalNumber: parsed.nationalNumber,
  };
}

export function validatePhone(phone, countryCode = '+86') {
  try {
    normalizePhone(phone, countryCode);
    return null;
  } catch (error) {
    return error.code === 'UNSUPPORTED_COUNTRY'
      ? '暂不支持该国家或地区的手机号'
      : '请输入有效的手机号码';
  }
}

export function getPhoneCountry(phone, countryCode = '+86') {
  return normalizePhone(phone, countryCode).country;
}

export function maskPhone(phone, countryCode = '+86') {
  try {
    const normalized = normalizePhone(phone, countryCode);
    const national = normalized.nationalNumber;
    const start = national.slice(0, Math.min(3, Math.max(1, national.length - 4)));
    return `${normalized.callingCode} ${start}****${national.slice(-4)}`;
  } catch {
    return '***';
  }
}

export function getPhoneLookupCandidates(phone, countryCode = '+86') {
  const normalized = normalizePhone(phone, countryCode);
  const candidates = new Set([normalized.e164]);
  if (normalized.nationalNumber) candidates.add(normalized.nationalNumber);
  const rawLocal = String(phone || '').trim();
  if (rawLocal && !rawLocal.startsWith('+')) {
    const digits = rawLocal.replace(/\D/g, '');
    if (digits) candidates.add(digits);
  }
  return [...candidates];
}
