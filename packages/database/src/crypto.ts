import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto';

const DEFAULT_PEPPER = 'scamtrap-privacy-pepper-2026-default-key';
const DEFAULT_ENCRYPTION_KEY = 'scamtrap-aes-encryption-key-32bytes-default';

export const normalizeEntityValue = (type: string, value: string): string => {
  const trimmed = value.trim();
  const lowerType = type.toLowerCase();

  if (lowerType === 'phone') {
    const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
    if (digitsOnly.startsWith('+66')) {
      return `0${digitsOnly.slice(3)}`;
    }
    return digitsOnly;
  }

  if (lowerType === 'bank_account' || lowerType === 'promptpay' || lowerType === 'national_id') {
    return trimmed.replace(/[\s\-]/g, '');
  }

  if (lowerType === 'url') {
    try {
      const hasProto = /^https?:\/\//i.test(trimmed);
      const parsed = new URL(hasProto ? trimmed : `https://${trimmed}`);
      return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase().replace(/\/$/, '')}`;
    } catch {
      return trimmed.toLowerCase().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    }
  }

  if (lowerType === 'email' || lowerType === 'line_id') {
    return trimmed.toLowerCase();
  }

  return trimmed;
};

export const computeLookupDigest = (
  type: string,
  value: string,
  secret: string = process.env.DATA_PEPPER_SECRET || DEFAULT_PEPPER,
): string => {
  const normalized = normalizeEntityValue(type, value);
  const hmac = createHmac('sha256', secret);
  hmac.update(`${type.toLowerCase()}:${normalized}`);
  return hmac.digest('hex');
};

const getDerivedKey = (secret: string): Buffer => {
  return createHash('sha256').update(secret).digest();
};

export const encryptValue = (
  plaintext: string,
  secret: string = process.env.DATA_ENCRYPTION_SECRET || DEFAULT_ENCRYPTION_KEY,
): string => {
  const iv = randomBytes(12);
  const key = getDerivedKey(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptValue = (
  encryptedPayload: string,
  secret: string = process.env.DATA_ENCRYPTION_SECRET || DEFAULT_ENCRYPTION_KEY,
): string => {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('INVALID_ENCRYPTED_PAYLOAD_FORMAT');
  }

  const [ivHex, tagHex, dataHex] = parts;
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('INVALID_ENCRYPTED_PAYLOAD_COMPONENTS');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const key = getDerivedKey(secret);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

export const maskValue = (type: string, rawValue: string): string => {
  const normalized = normalizeEntityValue(type, rawValue);
  const lowerType = type.toLowerCase();

  if (lowerType === 'phone') {
    if (normalized.length >= 9) {
      const prefix = normalized.slice(0, 3);
      const suffix = normalized.slice(-3);
      return `${prefix}-***-${suffix}`;
    }
    return '***-***-****';
  }

  if (lowerType === 'bank_account' || lowerType === 'promptpay') {
    if (normalized.length >= 8) {
      const prefix = normalized.slice(0, 3);
      const suffix = normalized.slice(-3);
      return `${prefix}-****-${suffix}`;
    }
    return '****-****';
  }

  if (lowerType === 'email') {
    const atIndex = normalized.indexOf('@');
    if (atIndex > 1) {
      const user = normalized.slice(0, atIndex);
      const domain = normalized.slice(atIndex);
      return `${user[0]}***${user[user.length - 1]}${domain}`;
    }
    return '***@***.***';
  }

  if (lowerType === 'url') {
    try {
      const parsed = new URL(rawValue.startsWith('http') ? rawValue : `https://${rawValue}`);
      return `${parsed.protocol}//${parsed.hostname}/***`;
    } catch {
      const slashIdx = normalized.indexOf('/');
      return slashIdx > 0 ? `${normalized.slice(0, slashIdx)}/***` : `${normalized}/***`;
    }
  }

  if (lowerType === 'line_id') {
    if (normalized.length > 3) {
      return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
    }
    return '***';
  }

  if (normalized.length > 4) {
    return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  }
  return '***';
};
