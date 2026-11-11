import { createHash, randomBytes } from 'node:crypto';

const BYTES_TOKEN = 32;

// RNF-06: random 32-byte token in base64url. It travels in a URL (QR, validation link); never persist it.
export function generarToken(): string {
  return randomBytes(BYTES_TOKEN).toString('base64url');
}

// RNF-06: only the SHA-256 hash is stored; the raw token cannot be recovered afterwards.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
