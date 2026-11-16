import { expect, test } from '@playwright/test';
import { entrarComo, irAlCodigoCorto } from './helpers/alumno';
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

test('RF-15: el alumno registra su entrada con el código corto y la ve en su historial', async ({ page }) => {
  const alumno = await seedAlumnoListoParaEscanear();
  await entrarComo(page, alumno);

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
  await entrarComo(page, alumno);

  const campo = await irAlCodigoCorto(page);
  // The alphabet of the generated codes has no 0 or 1, so this code never exists.
  await campo.fill('000000');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(
    'El código QR no es válido. Pide a tu supervisor que lo verifique con vinculación.',
  );
});
