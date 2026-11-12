import { expect, test } from '@playwright/test';
import { backendReachable, e2eConfigProblem, seedAlumno } from './helpers/seedAlumno';

// RF-02 end to end on the mobile projects (iPhone 13, Pixel 7). Needs the real backend and a
// staff account: see e2e/helpers/seedAlumno.ts. Skips with a message instead of failing when
// either is missing.
test.beforeAll(async () => {
  const problem = e2eConfigProblem();
  test.skip(problem !== null, problem ?? '');
  test.skip(!(await backendReachable()), 'The backend is not reachable at /api/health (start docker, backend and Vite).');
});

test('RF-02: a pre-loaded student activates the account and lands on the home screen', async ({ page }) => {
  const alumno = await seedAlumno();

  await page.goto('/activar');
  await page.getByLabel('Matrícula').fill(alumno.matricula);
  await page.getByLabel('Nombre', { exact: true }).fill(alumno.nombre);
  await page.getByLabel('Primer apellido').fill(alumno.apellidoPaterno);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByLabel('Contraseña', { exact: true }).fill('Secreta12345');
  await page.getByLabel('Confirmar contraseña').fill('Secreta12345');
  await expect(page.getByRole('region', { name: 'Aviso de privacidad' })).toBeVisible();
  await page.getByLabel('He leído el aviso de privacidad').check();
  await page.getByRole('button', { name: 'Activar cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
  await expect(page).toHaveURL(/\/alumno$/);

  // The session is real: signing out returns to the sign-in screen, and the student can sign back in.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Matrícula o correo').fill(alumno.matricula);
  await page.getByLabel('Contraseña').fill('Secreta12345');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
});

test('RF-02: an unknown matrícula shows the not-registered message', async ({ page }) => {
  await page.goto('/activar');
  await page.getByLabel('Matrícula').fill('00000000000000');
  await page.getByLabel('Nombre', { exact: true }).fill('Nadie');
  await page.getByLabel('Primer apellido').fill('Registrado');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('alert')).toHaveText('Tu matrícula no está registrada; acude a la Oficina de Prácticas Profesionales o a la de Servicio Social y Titulación');
});
