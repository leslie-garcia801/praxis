import { randomInt } from 'node:crypto';
import { generarToken, hashToken } from './tokens.js';

// Uppercase and digits without look-alikes (no 0/O, 1/I/L): read aloud or written on paper (RF-15).
export const ALFABETO_CODIGO_CORTO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD_CODIGO_CORTO = 6;

export function generarCodigoCorto(): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD_CODIGO_CORTO; i++) codigo += ALFABETO_CODIGO_CORTO[randomInt(ALFABETO_CODIGO_CORTO.length)];
  return codigo;
}

// RNF-06: only the hash is stored; the raw token cannot be recovered afterwards.
export const hashTokenQr = hashToken;

// Fresh QR credentials for an institution. `token` goes in the QR URL (RF-13); never persist it.
export function generarCredencialesQr() {
  const token = generarToken();
  return { token, qrTokenHash: hashTokenQr(token), codigoCorto: generarCodigoCorto() };
}
