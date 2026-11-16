import { expect, type Locator, type Page } from '@playwright/test';
import type { SeededAlumnoListo } from './seedAlumno';

// Opens the student's home with the session the seed already opened through the API. Signing in
// again through the UI would count against the backend's limit of 10 sign-ins per minute (RNF-06);
// the sign-in screen itself is covered by activar.spec.ts.
export async function entrarComo(page: Page, alumno: SeededAlumnoListo): Promise<void> {
  await page.context().addCookies(alumno.cookies);
  await page.goto('/alumno');
  await expect(page.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
}

// Opens Registrar and the short-code form (RF-15). There is no camera in the test browsers: the page
// switches to the short code by itself after the camera error, and may do so while the student is
// about to tap "Escribir el código". So the tap is only attempted while the field is not there yet,
// and a tap that finds the button already gone is ignored.
export async function irAlCodigoCorto(page: Page): Promise<Locator> {
  await page.getByRole('link', { name: 'Registrar' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar asistencia' })).toBeVisible();
  const campo = page.getByLabel('Código de la institución');
  const escribir = page.getByRole('button', { name: 'Escribir el código' });
  await expect(campo.or(escribir)).toBeVisible();
  if (!(await campo.isVisible())) {
    await escribir.click({ timeout: 5_000 }).catch(() => undefined);
  }
  await expect(campo).toBeVisible();
  return campo;
}
