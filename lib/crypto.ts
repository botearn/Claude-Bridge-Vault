/**
 * AES-256-GCM encryption using Web Crypto API (works in Node.js & Edge).
 * Format: base64(iv + authTag + ciphertext)
 */

const ALG = 'AES-GCM';

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.ACCOUNT_ENCRYPT_KEY || process.env.JWT_SECRET || process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ACCOUNT_ENCRYPT_KEY (or JWT_SECRET) must be set');

  // Derive a 256-bit key from the secret using PBKDF2
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('vault-accounts-salt'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALG, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt plaintext → base64 string */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: ALG, iv }, key, encoded);

  // Pack: iv(12) + ciphertext (includes GCM auth tag appended by WebCrypto)
  const packed = new Uint8Array(iv.length + cipherBuf.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipherBuf), iv.length);

  // Base64 encode
  return btoa(Array.from(packed, b => String.fromCharCode(b)).join(''));
}

/** Decrypt base64 string → plaintext */
export async function decrypt(encoded: string): Promise<string> {
  if (!encoded) return '';

  // Try to decode as base64; if it fails, assume legacy plaintext
  let packed: Uint8Array;
  try {
    const binary = atob(encoded);
    packed = Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch {
    return encoded; // not base64 → legacy plaintext
  }

  // Must have at least iv(12) + authTag(16) + 1 byte ciphertext
  if (packed.length < 29) return encoded;

  try {
    const key = await getKey();
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: ALG, iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
  } catch {
    // Decryption failed → assume legacy plaintext
    return encoded;
  }
}
