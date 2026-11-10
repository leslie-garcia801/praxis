import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const PREVIEW_URL = '*/api/importaciones/instituciones/preview';
const CONFIRMAR_URL = '*/api/importaciones/instituciones/confirmar';
const RUTA = '/vinculacion/importar/instituciones';

const reporteValido = {
  resumen: { total: 2, validas: 2, conErrores: 0, crear: 1, omitir: 1 },
  filas: [
    { fila: 2, nombre: 'Hospital Alfa', accion: 'CREAR', coincideCon: null, errores: [] },
    {
      fila: 3,
      nombre: 'Clínica Beta',
      accion: 'OMITIR',
      coincideCon: { id: 'x', nombre: 'Clínica Beta SA', por: 'RFC' },
      errores: [],
    },
  ],
};

const reporteConErrores = {
  resumen: { total: 2, validas: 1, conErrores: 1, crear: 1, omitir: 0 },
  filas: [
    { fila: 2, nombre: 'Hospital Alfa', accion: 'CREAR', coincideCon: null, errores: [] },
    {
      fila: 3,
      nombre: 'Clínica Beta',
      accion: null,
      coincideCon: null,
      errores: [{ campo: 'municipio', mensaje: 'Escribe el municipio.' }],
    },
  ],
};

function apiError(code: string, message: string, status: number, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

function mockStaff() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));
}

async function openAndUpload(file = new File(['x'], 'instituciones.xlsx')) {
  mockStaff();
  const ctx = renderApp(RUTA);
  await ctx.user.upload(await screen.findByLabelText('Archivo de instituciones'), file);
  return ctx;
}

async function review(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Revisar archivo' }));
}

describe('/vinculacion/importar/instituciones (RF-07)', () => {
  it('offers the institutions template download', async () => {
    mockStaff();
    renderApp(RUTA);
    const link = await screen.findByRole('link', { name: /Descargar plantilla/ });
    expect(link).toHaveAttribute('href', '/api/importaciones/instituciones/plantilla');
    expect(screen.getByRole('heading', { name: 'Importar instituciones' })).toBeInTheDocument();
  });

  it('requires the vinculación or admin role', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));
    renderApp(RUTA);
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
  });

  it('keeps the review button disabled until a file is chosen', async () => {
    mockStaff();
    renderApp(RUTA);
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

  it('sends the raw file with the xlsx Content-Type inferred from the extension', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(PREVIEW_URL, ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json(reporteValido);
      }),
    );
    const { user } = await openAndUpload();
    await review(user);
    await screen.findByRole('heading', { name: 'Vista previa' });
    expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it.each([
    ['ARCHIVO_INVALIDO', 'Sube un archivo .xlsx o .csv.', 400],
    ['COLUMNAS_FALTANTES', 'Faltan columnas: nombre, calle.', 400],
    ['ARCHIVO_DEMASIADO_GRANDE', 'El archivo pesa más de 2 MB.', 413],
  ])('shows the API message for %s and lets the user retry', async (code, message, status) => {
    server.use(http.post(PREVIEW_URL, () => apiError(code, message, status)));
    const { user } = await openAndUpload();
    await review(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Revisar archivo' })).toBeEnabled();
  });

  it('previews Crear and Omitir rows, with the match by RFC, and enables the confirmation', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)));
    const { user } = await openAndUpload();
    await review(user);

    await screen.findByRole('heading', { name: 'Vista previa' });
    const summary = screen.getByRole('region', { name: 'Resumen' });
    expect(within(summary).getByText('Total de filas').nextSibling).toHaveTextContent('2');
    expect(within(summary).getByText('A crear').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('A omitir').nextSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Con errores').nextSibling).toHaveTextContent('0');

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Hospital Alfa');
    expect(rows[1]).toHaveTextContent('Crear');
    expect(rows[2]).toHaveTextContent('Clínica Beta');
    expect(rows[2]).toHaveTextContent('Omitir');
    expect(rows[2]).toHaveTextContent('Clínica Beta SA');
    expect(rows[2]).toHaveTextContent('por RFC');
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeEnabled();
  });

  it('shows row errors from the API and blocks the confirmation', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteConErrores)));
    const { user } = await openAndUpload();
    await review(user);

    await screen.findByRole('heading', { name: 'Vista previa' });
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[2]).toHaveTextContent('Con errores');
    expect(rows[2]).toHaveTextContent('municipio');
    expect(rows[2]).toHaveTextContent('Escribe el municipio.');
    expect(screen.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
    expect(screen.getByText(/No se importará nada hasta que corrijas el archivo/)).toBeInTheDocument();
  });

  it('goes back to the upload step with "Elegir otro archivo"', async () => {
    server.use(http.post(PREVIEW_URL, () => HttpResponse.json(reporteConErrores)));
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Elegir otro archivo' }));
    expect(await screen.findByLabelText('Archivo de instituciones')).toBeInTheDocument();
  });

  it('confirms the import and shows creados and omitidos, then resets', async () => {
    server.use(
      http.post(PREVIEW_URL, () => HttpResponse.json(reporteValido)),
      http.post(CONFIRMAR_URL, () => HttpResponse.json({ resumen: { creados: 1, omitidos: 1 } }, { status: 201 })),
    );
    const { user } = await openAndUpload();
    await review(user);
    await user.click(await screen.findByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('heading', { name: 'Importación completada' })).toBeInTheDocument();
    const result = screen.getByRole('region', { name: 'Resultado' });
    expect(within(result).getByText('Instituciones creadas').nextSibling).toHaveTextContent('1');
    expect(within(result).getByText('Instituciones omitidas').nextSibling).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Ver instituciones' })).toHaveAttribute('href', '/vinculacion/instituciones');

    await user.click(screen.getByRole('button', { name: 'Importar otro archivo' }));
    expect(await screen.findByLabelText('Archivo de instituciones')).toBeInTheDocument();
  });

  it('returns to the preview with the fresh report when the confirmation answers 422', async () => {
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
    expect(within(screen.getByRole('table')).getByText('Escribe el municipio.')).toBeInTheDocument();
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
