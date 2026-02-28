import { env } from '@/lib/env';

function decodeBase64(base64: string) {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

export async function encryptText(plainText: string): Promise<string | null> {
  if (!env.DATA_ENCRYPTION_KEY) return null;
  const keyBytes = decodeBase64(env.DATA_ENCRYPTION_KEY);
  if (keyBytes.byteLength !== 32) return null;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);

  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;
}
