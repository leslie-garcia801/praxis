import { request, type APIRequestContext } from '@playwright/test';

// Test data comes from the real API, signed in as an existing vinculación/admin user (no backend
// routes are added for tests). Required environment variables:
//   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD  an ADMIN or VINCULACION user that has already replaced
//                                         its temporary password (RF-04) and is allowed to import.
// Optional: E2E_BASE_URL (default http://localhost:5173; the Vite proxy forwards /api to :3000).
// The backend (pnpm dev in backend/) and PostgreSQL must be running, with the base seed applied
// (pnpm db:seed) so the career "Programación" exists.

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export function e2eConfigProblem(): string | null {
  if (!process.env.E2E_STAFF_EMAIL || !process.env.E2E_STAFF_PASSWORD) {
    return 'Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD (see e2e/helpers/seedAlumno.ts).';
  }
  return null;
}

export async function backendReachable(): Promise<boolean> {
  const api = await request.newContext({ baseURL: BASE_URL });
  try {
    const res = await api.get('/api/health', { timeout: 3_000 });
    return res.ok();
  } catch {
    return false;
  } finally {
    await api.dispose();
  }
}

export type SeededAlumno = { matricula: string; nombre: string; apellidoPaterno: string };

// A 14-digit control number that is unique per call.
function uniqueMatricula(): string {
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-7);
  return `2531905${tail}`;
}

async function signInAsStaff(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const res = await api.post('/api/auth/sign-in/email', {
    data: { email: process.env.E2E_STAFF_EMAIL, password: process.env.E2E_STAFF_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Staff sign-in failed (${res.status()}): ${await res.text()}`);
  return api;
}

// Imports one student with no password (RF-01), the state RF-02 expects to activate.
export async function seedAlumno(): Promise<SeededAlumno> {
  const alumno = { matricula: uniqueMatricula(), nombre: 'Ana María', apellidoPaterno: 'López' };
  const csv = [
    'Número de control,Nombre,Apellido paterno,Apellido materno,Carrera,Semestre,Grupo,Turno,Tipo',
    `${alumno.matricula},${alumno.nombre},${alumno.apellidoPaterno},García,Programación,5,A,Matutino,Servicio social`,
  ].join('\n');

  const api = await signInAsStaff();
  try {
    const res = await api.post('/api/importaciones/alumnos/confirmar', {
      headers: { 'Content-Type': 'text/csv' },
      data: Buffer.from(csv, 'utf-8'),
    });
    if (!res.ok()) throw new Error(`Student import failed (${res.status()}): ${await res.text()}`);
  } finally {
    await api.dispose();
  }
  return alumno;
}
