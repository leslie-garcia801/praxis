import { randomInt } from 'node:crypto';

// No look-alike characters (0/O/o, 1/I/l), since vinculación reads it out or writes it on paper.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LONGITUD = 10;

// RF-04: temporary password; the student must change it on first sign-in (debeCambiar).
export function generarPasswordTemporal(): string {
  let password = '';
  for (let i = 0; i < LONGITUD; i++) password += ALFABETO[randomInt(ALFABETO.length)];
  return password;
}
