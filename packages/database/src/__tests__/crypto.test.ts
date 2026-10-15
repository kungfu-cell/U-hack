import { describe, expect, it } from 'vitest';
import {
  computeLookupDigest,
  decryptValue,
  encryptValue,
  maskValue,
  normalizeEntityValue,
} from '../crypto.js';

describe('Crypto & Privacy Utilities', () => {
  describe('normalizeEntityValue', () => {
    it('normalizes Thai phone numbers with +66 and formatting', () => {
      expect(normalizeEntityValue('phone', '+66 81-234-5678')).toBe('0812345678');
      expect(normalizeEntityValue('phone', '081 234 5678')).toBe('0812345678');
      expect(normalizeEntityValue('phone', '02-123-4567')).toBe('021234567');
    });

    it('normalizes bank accounts and promptpay', () => {
      expect(normalizeEntityValue('bank_account', '123-4-56789-0')).toBe('1234567890');
      expect(normalizeEntityValue('promptpay', '081-999-8888')).toBe('0819998888');
    });

    it('normalizes URLs by trimming protocols and trailing slashes', () => {
      expect(normalizeEntityValue('url', 'https://scam-site.vip/auth/')).toBe('scam-site.vip/auth');
      expect(normalizeEntityValue('url', 'HTTP://SUB.EXAMPLE.COM/PATH')).toBe('sub.example.com/path');
    });

    it('normalizes email and LINE IDs to lowercase', () => {
      expect(normalizeEntityValue('email', ' User@Example.COM ')).toBe('user@example.com');
      expect(normalizeEntityValue('line_id', ' Police_Officer_99 ')).toBe('police_officer_99');
    });
  });

  describe('computeLookupDigest', () => {
    it('computes consistent HMAC-SHA256 digests for identical entities', () => {
      const digest1 = computeLookupDigest('phone', '081-234-5678', 'secret-key');
      const digest2 = computeLookupDigest('phone', '+66 81 234 5678', 'secret-key');
      expect(digest1).toBe(digest2);
      expect(digest1).toHaveLength(64);
    });

    it('produces different digests for different entities or secrets', () => {
      const digest1 = computeLookupDigest('phone', '081-234-5678', 'secret-1');
      const digest2 = computeLookupDigest('phone', '081-234-5678', 'secret-2');
      const digest3 = computeLookupDigest('phone', '089-999-9999', 'secret-1');

      expect(digest1).not.toBe(digest2);
      expect(digest1).not.toBe(digest3);
    });
  });

  describe('encryptValue and decryptValue (AES-256-GCM)', () => {
    it('successfully encrypts and decrypts sensitive values', () => {
      const sensitiveAccount = '081-998-4321';
      const secret = 'my-super-secret-master-key-32b';

      const encrypted = encryptValue(sensitiveAccount, secret);
      expect(encrypted).toContain(':');
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = decryptValue(encrypted, secret);
      expect(decrypted).toBe(sensitiveAccount);
    });

    it('fails to decrypt if payload is tampered with', () => {
      const encrypted = encryptValue('secret-data');
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:bad${parts[2]?.slice(3)}`;

      expect(() => decryptValue(tampered)).toThrow();
    });
  });

  describe('maskValue', () => {
    it('masks phone numbers properly', () => {
      expect(maskValue('phone', '081-234-5678')).toBe('081-***-678');
      expect(maskValue('phone', '0812345678')).toBe('081-***-678');
    });

    it('masks bank accounts properly', () => {
      expect(maskValue('bank_account', '123-4-56789-0')).toBe('123-****-890');
    });

    it('masks URLs properly', () => {
      expect(maskValue('url', 'https://phishing.site.vip/login/redirect')).toBe('https://phishing.site.vip/***');
    });

    it('masks emails properly', () => {
      expect(maskValue('email', 'somchai@gmail.com')).toBe('s***i@gmail.com');
    });

    it('masks LINE IDs properly', () => {
      expect(maskValue('line_id', 'policeman99')).toBe('po***9');
    });
  });
});
