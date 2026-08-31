import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY.length !== 32 && ENCRYPTION_KEY.length !== 64) {
    console.warn('[encryption] ENCRYPTION_KEY should be 32 or 64 chars for AES-256. Padding with zeros.');
    return Buffer.alloc(32, ENCRYPTION_KEY);
  }
  return Buffer.from(ENCRYPTION_KEY.substring(0, 32));
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
