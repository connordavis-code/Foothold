import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Symmetric encryption for sensitive at-rest values (currently:
 * `plaid_item.access_token`). Key comes from PLAID_TOKEN_ENCRYPTION_KEY,
 * a base64-encoded 32-byte secret.
 *
 * Format on disk: base64( iv || ciphertext || authTag ), where iv is 12B
 * (GCM standard) and authTag is 16B. Single self-contained string fits
 * the existing `text` column.
 *
 * Rotating the key is destructive — reconnect every plaid_item to mint
 * fresh access_tokens. There's no key-versioning here because we have
 * one user; revisit if multi-tenant.
 */

const KEY = Buffer.from(env.PLAID_TOKEN_ENCRYPTION_KEY, 'base64');
if (KEY.length !== 32) {
  throw new Error(
    `PLAID_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes); got ${KEY.length} bytes.`,
  );
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

export function decryptToken(encrypted: string): string {
  const blob = Buffer.from(encrypted, 'base64');
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted token is too short to be valid.');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
