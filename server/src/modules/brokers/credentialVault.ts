import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION_PREFIX = 'v1:';

function deriveVaultKey(): Buffer {
  const rawSecret =
    process.env.TRAXO_CREDENTIAL_KEY?.trim() ||
    process.env.FIREBASE_PRIVATE_KEY?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    'traxo-local-dev-vault-key-change-in-production';

  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const clean = String(plaintext || '').trim();
  if (!clean) return '';
  const key = deriveVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(ciphertext: string | null | undefined): string {
  const raw = String(ciphertext || '').trim();
  if (!raw) return '';
  if (!raw.startsWith(VERSION_PREFIX)) {
    return raw;
  }
  try {
    const parts = raw.slice(VERSION_PREFIX.length).split(':');
    if (parts.length !== 3) return '';
    const [ivB64, tagB64, dataB64] = parts;
    const key = deriveVaultKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(plaintextOrCipher: string | null | undefined): string | null {
  const plain = decryptSecret(plaintextOrCipher);
  if (!plain) return null;
  if (plain.length <= 4) return '••••';
  return `••••${plain.slice(-4)}`;
}

export function signWebhookPayload(payloadJson: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadJson, 'utf8').digest('hex');
}
