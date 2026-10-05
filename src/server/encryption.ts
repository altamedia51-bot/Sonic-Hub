import crypto from 'crypto';

// Encryption configuration using AES-256-GCM
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns a 32-byte Buffer key for AES-256
 */
function getMasterKey(): Buffer {
  const envKey = process.env.KIE_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  if (envKey && envKey.length === 32) {
    return Buffer.from(envKey, 'utf-8');
  }
  // Deterministic stable fallback for dev environment based on app secret / default salt
  const fallbackSecret = process.env.GEMINI_API_KEY || 'sonic-hub-ai-master-encryption-key-2026';
  return crypto.createHash('sha256').update(fallbackSecret).digest();
}

/**
 * Encrypts a plaintext KIE API key.
 * Output format: base64(iv + authTag + ciphertext)
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plainKey, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: IV (12) + Tag (16) + Encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

const CANDIDATE_SECRETS: string[] = [
  process.env.KIE_ENCRYPTION_KEY || '',
  'sonic-hub-ai-master-encryption-key-2026',
  process.env.GEMINI_API_KEY || '',
  'sonic-hub-ai-secret-salt-2026',
  'fine-discovery-207pf'
].filter(s => s && s.length > 0);

/**
 * Decrypts an encrypted KIE API key string.
 */
export function decryptApiKey(cipherTextBase64: string): string {
  if (!cipherTextBase64) return '';
  const trimmed = cipherTextBase64.trim();

  // If already plain text (e.g. sk-...)
  if (trimmed.startsWith('sk-') || trimmed.startsWith('kie_')) {
    return trimmed;
  }

  // Check if it's simple base64 encoded plain text
  try {
    const rawUtf8 = Buffer.from(trimmed, 'base64').toString('utf8');
    if (rawUtf8.startsWith('sk-') || rawUtf8.startsWith('kie_')) {
      return rawUtf8;
    }
  } catch {}

  let combined: Buffer;
  try {
    combined = Buffer.from(trimmed, 'base64');
  } catch {
    return trimmed;
  }

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    return trimmed;
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // Try candidate keys
  for (const secret of CANDIDATE_SECRETS) {
    try {
      let key: Buffer;
      if (secret.length === 64) {
        key = Buffer.from(secret, 'hex');
      } else if (secret.length === 32) {
        key = Buffer.from(secret, 'utf-8');
      } else {
        key = crypto.createHash('sha256').update(secret).digest();
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      const result = decrypted.toString('utf8');
      if (result && result.trim()) return result.trim();
    } catch {
      // Try next secret
    }
  }

  // Fallback: if string looks like a key, return it directly
  if (trimmed.length > 20) {
    return trimmed;
  }

  throw new Error('Unable to decrypt API key');
}

/**
 * Produces a masked display version of an API key (e.g., sk-••••••••••••AB12)
 */
export function maskApiKey(plainKey: string): string {
  if (!plainKey) return '';
  const trimmed = plainKey.trim();
  if (trimmed.length <= 8) {
    return 'sk-••••••••';
  }
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}
