import { request, type APIRequestContext, type APIResponse } from '@playwright/test';

// Test data comes from the real API, signed in as an existing vinculación/admin user (no backend
// routes are added for tests). Required environment variables:
//   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD  an ADMIN or VINCULACION user that has already replaced
//                                         its temporary password (RF-04) and is allowed to import.
// Optional: E2E_BASE_URL (default http://localhost:5173; the Vite proxy forwards /api to :3000).
// The backend (pnpm dev in backend/) and PostgreSQL must be running, with the base seed applied
// (pnpm db:seed) so the career "Programación" exists. No other variable is needed: the staff user
// must also be allowed to create institutions, supervisors and to confirm servicio social case files
// (an ADMIN, or the VINCULACION user of the Servicio Social office).

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

// Fails with the response body so a broken seed step is easy to diagnose.
async function expectOk(res: APIResponse, step: string): Promise<void> {
  if (!res.ok()) throw new Error(`${step} failed (${res.status()}): ${await res.text()}`);
}

// Imports one student with no password (RF-01), the state RF-02 expects to activate.
async function importarAlumno(api: APIRequestContext): Promise<SeededAlumno> {
  const alumno = { matricula: uniqueMatricula(), nombre: 'Ana María', apellidoPaterno: 'López' };
  const csv = [
    'Número de control,Nombre,Apellido paterno,Apellido materno,Carrera,Semestre,Grupo,Turno,Tipo',
    `${alumno.matricula},${alumno.nombre},${alumno.apellidoPaterno},García,Programación,5,A,Matutino,Servicio social`,
  ].join('\n');
  const res = await api.post('/api/importaciones/alumnos/confirmar', {
    headers: { 'Content-Type': 'text/csv' },
    data: Buffer.from(csv, 'utf-8'),
  });
  await expectOk(res, 'Student import');
  return alumno;
}

export async function seedAlumno(): Promise<SeededAlumno> {
  const api = await signInAsStaff();
  try {
    return await importarAlumno(api);
  } finally {
    await api.dispose();
  }
}

export const PASSWORD_ALUMNO = 'Secreta12345';

export type SeededAlumnoListo = SeededAlumno & { password: string; institucion: string; codigoCorto: string };

// A student whose case file is EN_PROCESO and who can scan right away (RF-15). Everything goes through
// the public API: a new institution (unique name, so its short code belongs to this call only), an
// imported student (servicio social: no end date or schedule is needed, so no weekday or time of day
// matters), the activation (RF-02), the student completing the case file (RF-10) and the office
// confirming it (RF-10, RF-11). The start date is a fixed past day, so the scan is never "before the
// start" whatever the UTC / Monterrey date is when the test runs (RN-15).
export async function seedAlumnoListoParaEscanear(): Promise<SeededAlumnoListo> {
  const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const staff = await signInAsStaff();
  const student = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  try {
    const nombreInstitucion = `Institución E2E ${sufijo}`;
    const resInstitucion = await staff.post('/api/instituciones', {
      data: { nombre: nombreInstitucion, calle: 'Calle de prueba 1', municipio: 'Monterrey' },
    });
    await expectOk(resInstitucion, 'Institution creation');
    const { institucion } = (await resInstitucion.json()) as { institucion: { id: string; codigoCorto: string } };

    const resSupervisor = await staff.post(`/api/instituciones/${institucion.id}/supervisores`, {
      data: { nombre: 'Supervisor', apellidoPaterno: 'Prueba', correo: `supervisor-${sufijo}@example.test` },
    });
    await expectOk(resSupervisor, 'Supervisor creation');
    const { supervisor } = (await resSupervisor.json()) as { supervisor: { id: string } };

    const alumno = await importarAlumno(staff);

    await expectOk(
      await student.post('/api/auth/activar', {
        data: { matricula: alumno.matricula, nombre: alumno.nombre, apellidoPaterno: alumno.apellidoPaterno, password: PASSWORD_ALUMNO },
      }),
      'Account activation',
    );
    await expectOk(
      await student.post('/api/auth/sign-in/username', { data: { username: alumno.matricula, password: PASSWORD_ALUMNO } }),
      'Student sign-in',
    );
    const resPerfil = await student.get('/api/me');
    await expectOk(resPerfil, 'Student profile');
    const { expedienteActivo } = (await resPerfil.json()) as { expedienteActivo: { id: string } | null };
    if (!expedienteActivo) throw new Error('The imported student has no active case file.');

    await expectOk(
      await student.patch(`/api/expedientes/${expedienteActivo.id}`, {
        data: { institucionId: institucion.id, supervisorId: supervisor.id, fechaInicio: '2020-01-01' },
      }),
      'Case file completion',
    );
    await expectOk(await staff.post(`/api/expedientes/${expedienteActivo.id}/confirmar`), 'Case file confirmation');

    return { ...alumno, password: PASSWORD_ALUMNO, institucion: nombreInstitucion, codigoCorto: institucion.codigoCorto };
  } finally {
    await student.dispose();
    await staff.dispose();
  }
}
