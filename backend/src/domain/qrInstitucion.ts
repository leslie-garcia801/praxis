import { createHash, randomBytes, randomInt } from 'node:crypto';

// Uppercase and digits without look-alikes (no 0/O, 1/I/L): read aloud or written on paper (RF-15).
export const ALFABETO_CODIGO_CORTO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD_CODIGO_CORTO = 6;
const BYTES_TOKEN = 32;

export function generarCodigoCorto(): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD_CODIGO_CORTO; i++) codigo += ALFABETO_CODIGO_CORTO[randomInt(ALFABETO_CODIGO_CORTO.length)];
  return codigo;
}

// RNF-06: only the hash is stored; the raw token cannot be recovered afterwards.
export function hashTokenQr(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Fresh QR credentials for an institution. `token` goes in the QR URL (RF-13); never persist it.
export function generarCredencialesQr() {
  const token = randomBytes(BYTES_TOKEN).toString('base64url');
  return { token, qrTokenHash: hashTokenQr(token), codigoCorto: generarCodigoCorto() };
}
