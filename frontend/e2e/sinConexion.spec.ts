import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { entrarComo, irAlCodigoCorto } from './helpers/alumno';
import {
  backendReachable,
  e2eConfigProblem,
  seedAlumnoListoParaEscanear,
  type SeededAlumnoListo,
} from './helpers/seedAlumno';

// RF-16 / RN-14 end to end on the mobile projects (iPhone 13 -> WebKit, Pixel 7 -> Chromium), so the
// queue uses the real IndexedDB adapter. `pnpm test:e2e` runs against the Vite dev server, which has no
// service worker: once the context is offline the browser cannot load a new page or module. So every
// test loads the app and reaches the screen it needs WHILE ONLINE, goes offline, and from then on only
// uses client-side navigation (links and buttons). Opening the app offline from a cold start needs the
// service worker of a production build and is a manual check (see odd/tasks/0044).
// Needs the real backend and a staff account: see e2e/helpers/seedAlumno.ts.
test.beforeAll(async () => {
  const problem = e2eConfigProblem();
  test.skip(problem !== null, problem ?? '');
  test.skip(!(await backendReachable()), 'The backend is not reachable at /api/health (start docker, backend and Vite).');
});

const MENSAJE_QR_NO_ENCONTRADO =
  'El código QR no es válido. Pide a tu supervisor que lo verifique con vinculación.';

// Opens the student's session, opens the short-code form online, goes offline and submits the code:
// the record is queued.
async function registrarSinConexion(page: Page, context: BrowserContext, codigo: string, alumno: SeededAlumnoListo) {
  await entrarComo(page, alumno);
  const campo = await irAlCodigoCorto(page);
  await context.setOffline(true);
  await campo.fill(codigo);
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByText('Registro guardado. Pendiente de sincronizar.')).toBeVisible();
}

test('RF-16: sin conexión el registro queda pendiente y se envía al volver la red', async ({ page, context }) => {
  const alumno = await seedAlumnoListoParaEscanear();
  await registrarSinConexion(page, context, alumno.codigoCorto, alumno);

  // Client-side navigation only: the page cannot be reloaded offline in dev.
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  await expect(page.getByText('1 registro pendiente de sincronizar')).toBeVisible();

  // The app sends the queue on the `online` event.
  await context.setOffline(false);
  await expect(page.getByText('1 registro pendiente de sincronizar')).toBeHidden();
  await expect(page.getByText('Sin conexión', { exact: true })).toBeHidden();

  await page.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2} – en curso/)).toBeVisible();
});

test('RF-16: el registro pendiente sobrevive a cerrar la app y se envía al abrirla', async ({ page, context }) => {
  const alumno = await seedAlumnoListoParaEscanear();
  await registrarSinConexion(page, context, alumno.codigoCorto, alumno);

  // Closing the page drops all in-memory state; only IndexedDB, cookies and localStorage remain.
  await page.close();
  await context.setOffline(false);

  const nueva = await context.newPage();
  await nueva.goto('/');
  await expect(nueva.getByRole('heading', { name: 'Mi avance' })).toBeVisible();
  // Synced on open: no pending counter is left.
  await expect(nueva.getByText(/registros? pendientes? de sincronizar/)).toBeHidden();

  await nueva.getByRole('link', { name: 'Historial' }).click();
  await expect(nueva.getByRole('heading', { name: 'Historial' })).toBeVisible();
  await expect(nueva.getByText(/\d{2}:\d{2} – en curso/)).toBeVisible();
});

test('RN-14: un código inexistente registrado sin conexión aparece como rechazado y se puede descartar', async ({
  page,
  context,
}) => {
  const alumno = await seedAlumnoListoParaEscanear();
  // The alphabet of the generated codes has no 0 or 1, so this code never exists.
  await registrarSinConexion(page, context, '000000', alumno);
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByText('1 registro pendiente de sincronizar')).toBeVisible();

  await context.setOffline(false);

  const rechazados = page.getByRole('list', { name: 'Registros que no se aceptaron' });
  await expect(rechazados).toContainText(MENSAJE_QR_NO_ENCONTRADO);
  await expect(page.getByText(/registros? pendientes? de sincronizar/)).toBeHidden();

  await rechazados.getByRole('button', { name: 'Descartar' }).click();
  await expect(rechazados).toBeHidden();
  await expect(page.getByText(MENSAJE_QR_NO_ENCONTRADO)).toBeHidden();
});
