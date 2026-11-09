import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const PREVIEW_URL = '*/api/importaciones/alumnos/preview';
const CONFIRMAR_URL = '*/api/importaciones/alumnos/confirmar';

const reporteValido = {
  resumen: { total: 2, validas: 2, conErrores: 0, crear: 1, actualizar: 1 },
  filas: [
    { fila: 2, matricula: '25319051760001', accion: 'CREAR', errores: [] },
    { fila: 3, matricula: '25319051760002', accion: 'ACTUALIZAR', errores: [] },
  ],
};

const reporteConErrores = {
  resumen: { total: 3, validas: 2, conErrores: 1, crear: 2, actualizar: 0 },
  filas: [
    { fila: 2, matricula: '25319051760001', accion: 'CREAR', errores: [] },
    {
      fila: 3,
      matricula: '25319051760002',
      accion: null,
      errores: [{ campo: 'tipoAsignado', mensaje: 'El tipo asignado no corresponde a tu oficina.' }],
    },
    { fila: 4, matricula: '25319051760003', accion: 'CREAR', errores: [] },
  ],
};

function apiError(code: string, message: string, status: number, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

function mockStaff() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));
}

async function openAndUpload(file = new File(['x'], 'alumnos.xlsx')) {
  mockStaff();
  const ctx = renderApp('/vinculacion/importar/alumnos');
  const input = await screen.findByLabelText('Archivo de alumnos');
  await ctx.user.upload(input, file);
  return ctx;
}

async function review(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Revisar archivo' }));
}

describe('/vinculacion/importar/alumnos (RF-01)', () => {
  it('is reachable from the panel and offers the template download', async () => {
    mockStaff();
    const { user } = renderApp('/vinculacion');
    await user.click(await screen.findByRole('link', { name: 'Importar alumnos' }));
    const link = await screen.findByRole('link', { name: /Descargar plantilla/ });
    expect(link).toHaveAttribute('href', '/api/importaciones/alumnos/plantilla');
    expect(screen.getByRole('heading', { name: 'Importar alumnos' })).toBeInTheDocument();
  });

  it('requires the vinculación or admin role', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));
    renderApp('/vinculacion/importar/alumnos');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
  });

  it('keeps the review button disabled until a file is chosen', async () => {
    mockStaff();
    renderApp('/vinculacion/importar/alumnos');
    expect(await screen.findByRole('button', { name: 'Revisar archivo' })).toBeDisabled();
  });

  it('shows a loading state while the file is reviewed', async () => {
    server.use(
      http.post(PREVIEW_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(reporteValido);
      }),
    );
    const { user } = await openAndUpload();
    await review(user);
    expect(await screen.findByRole('button', { name: 'Revisando…' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();
  });

  it('shows the API message when the columns are missing', async () => {
    server.use(
      http.post(PREVIEW_URL, () =>
        apiError('COLUMNAS_FALTANTES', 'Faltan columnas: matricula, tipoAsignado.', 400, {
          columnas: ['matricula', 'tipoAsignado'],
        }),
      ),
    );
    const { user } = await openAndUpload();
    await review(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Faltan columnas: matricula, tipoAsignado.');
    expect(screen.getByRole('button', { name: 'Revisar archivo' })).toBeEnabled();
  });

  it('sends the raw file with a non-JSON Content-Type', async () => {
    let contentType: string | null = null;
    let received = '';
    server.use(
      http.post(PREVIEW_URL, async ({ request }) => {
        contentType = request.headers.get('content-type');
        received = await request.text();
        return HttpResponse.json(reporteValido);
      }),
    );
    const { user } = await openAndUpload(new File(['matricula,tipoAsignado\n1,SERVICIO_SOCIAL'], 'alumnos.csv'));
    await review(user);
    await screen.findByRole('heading', { name: 'Vista previa' });
    expect(contentType).toBe('text/csv');
    expect(received).toBe('matricula,tipoAsignado\n1,SERVICIO_SOCIAL');
  });

  it('infers the xlsx Content-Type from the extension when the browser gives none', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(PREVIEW_URL, ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json(reporteValido);
      }),
    );
    const { user } = await openAndUpload(new File(['x'], 'alumnos.xlsx'));
    await review(user);
    await screen.findByRole('heading', { name: 'Vista previa' });
    expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('blocks files over 2 MB without sending them', async () => {
    let called = false;
    server.use(
      http.post(PREVIEW_URL, () => {
        called = true;
        return HttpResponse.json(reporteValido);
      }),
    );
    await openAndUpload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.csv'));
    expect(screen.getByRole('alert')).toHaveTextContent('El archivo pesa más de 2 MB');
    expect(screen.getByRole('button', { name: 'Revisar archivo' })).toBeDisabled();
    expect(called).toBe(false);
  });

  it('previews all valid rows, with Crear and Actualizar, and enables the confirmation', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)));
    const { user } = await openAndUpload();
    await review(user);

    await screen.findByRole('heading', { name: 'Vista previa' });
    const summary = screen.getByRole('region', { name: 'Resumen' });
    expect(within(summary).getByText('Total de filas').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('A crear').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('A actualizar').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Con errores').nextSibling).toHaveTextContent('0');

    const list = screen.getByRole('list', { name: 'Filas del archivo' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('25319051760001');
    expect(items[0]).toHaveTextContent('Crear');
    expect(items[1]).toHaveTextContent('25319051760002');
    expect(items[1]).toHaveTextContent('Actualizar');
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeEnabled();
  });

  it('RN-03b: shows the office error from the API on its row and blocks the confirmation', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteConErrores)));
    const { user } = await openAndUpload();
    await review(user);

    await screen.findByRole('heading', { name: 'Vista previa' });
    const items = Array.from(screen.getByRole('list', { name: 'Filas del archivo' }).children);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Crear');
    expect(items[1]).toHaveTextContent('Con errores');
    expect(items[1]).toHaveTextContent('tipoAsignado');
    expect(items[1]).toHaveTextContent('El tipo asignado no corresponde a tu oficina.');
    expect(items[2]).toHaveTextContent('Crear');
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    expect(screen.getByText(/No se importará nada hasta que corrijas el archivo/)).toBeInTheDocument();
  });

  it('goes back to the upload step with "Elegir otro archivo"', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteConErrores)));
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Elegir otro archivo' }));
    expect(await screen.findByLabelText('Archivo de alumnos')).toBeInTheDocument();
  });

  it('confirms the import and shows the result, then resets', async () => {
    server.use(
      http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)),
      http.post(CONFIRMAR_URL, () =>
        HttpResponse.json({ resumen: { creados: 1, actualizados: 1, expedientesCreados: 1 } }, { status: 201 }),
      ),
    );
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('heading', { name: 'Importación completada' })).toBeInTheDocument();
    const result = screen.getByRole('region', { name: 'Resultado' });
    expect(within(result).getByText('Alumnos creados').nextSibling).toHaveTextContent('1');
    expect(within(result).getByText('Alumnos actualizados').nextSibling).toHaveTextContent('1');
    expect(within(result).getByText('Expedientes creados').nextSibling).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Importar otro archivo' }));
    expect(await screen.findByLabelText('Archivo de alumnos')).toBeInTheDocument();
  });

  it('returns to the preview with the report when the confirmation answers 422', async () => {
    server.use(
      http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)),
      http.post(CONFIRMAR_URL, () =>
        apiError('IMPORTACION_CON_ERRORES', 'El archivo tiene errores; no se importó nada.', 422, reporteConErrores),
      ),
    );
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo tiene errores; no se importó nada.');
    expect(
      within(screen.getByRole('list', { name: 'Filas del archivo' })).getByText(
        'El tipo asignado no corresponde a tu oficina.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
  });

  it('keeps the preview and shows the message when the confirmation answers 409', async () => {
    server.use(
      http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)),
      http.post(CONFIRMAR_URL, () =>
        apiError('IMPORTACION_CONFLICTO', 'Los datos cambiaron durante la importación. Revisa el archivo de nuevo.', 409),
      ),
    );
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Los datos cambiaron durante la importación.');
    expect(screen.getByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeEnabled();
  });
});
