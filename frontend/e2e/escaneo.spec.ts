import { expect, test, type Page } from '@playwright/test';
import { backendReachable, e2eConfigProblem, seedAlumnoListoParaEscanear } from './helpers/seedAlumno';

// RF-14 / RF-15 end to end on the mobile projects (iPhone 13, Pixel 7). There is no camera in the
// test browsers and none is granted: the student uses the short-code fallback. Needs the real
// backend and a staff account: see e2e/helpers/seedAlumno.ts. Skips with a message instead of failing
// when either is missing.
test.beforeAll(async () => {
  const problem = e2eConfigProblem();
  test.skip(problem !== null, problem ?? '');
  test.skip(!(await backendReachable()), 'The backend is not reachable at /api/health (start docker, backend and Vite).');
});

async function entrar(page: Page, matricula: string, password: string) {
  await page.goto('/entrar');
  await page.getByLabel('Matrícula o correo').fill(matricula);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
}

// The camera starts on arrival and, with no camera, the page switches to the short code by itself
// after an error; if it has not yet, the student taps "Escribir el código".
async function irAlCodigoCorto(page: Page) {
  await page.getByRole('link', { name: 'Registrar' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar asistencia' })).toBeVisible();
  const campo = page.getByLabel('Código de la institución');
  const escribir = page.getByRole('button', { name: 'Escribir el código' });
  await expect(campo.or(escribir)).toBeVisible();
  if (await escribir.isVisible()) await escribir.click();
  await expect(campo).toBeVisible();
  return campo;
}

test('RF-15: el alumno registra su entrada con el código corto y la ve en su historial', async ({ page }) => {
  const alumno = await seedAlumnoListoParaEscanear();
  await entrar(page, alumno.matricula, alumno.password);

  const campo = await irAlCodigoCorto(page);
  await campo.fill(alumno.codigoCorto);
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByText(/^Entrada registrada a las /)).toBeVisible();

  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
  await page.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  // The open shift of today shows "HH:mm – en curso".
  await expect(page.getByText(/\d{2}:\d{2} – en curso/)).toBeVisible();
});

test('RF-15: un código corto inexistente muestra el mensaje de error', async ({ page }) => {
  const alumno = await seedAlumnoListoParaEscanear();
  await entrar(page, alumno.matricula, alumno.password);

  const campo = await irAlCodigoCorto(page);
  // The alphabet of the generated codes has no 0 or 1, so this code never exists.
  await campo.fill('000000');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(
    'El código QR no es válido. Pide a tu supervisor que lo verifique con vinculación.',
  );
});
