import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilaPanel, buildInstitucion, buildMe, buildPanel, carrerasEjemplo } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ANA = '44444444-4444-4444-8444-444444444441';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function mockStaff() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }))),
    http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
    http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [buildInstitucion()] })),
    http.get('*/api/panel/alumnos', () =>
      HttpResponse.json(
        buildPanel({
          alumnos: [buildFilaPanel()],
          alertas: { sinRegistros: { total: 1, expedienteIds: [ANA] } },
        }),
      ),
    ),
  );
}

// Serves the xlsx and records the query string of each request.
function mockExport(ruta: 'alumnos.xlsx' | 'edumedia.xlsx', archivo: string) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`*/api/panel/${ruta}`, ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return new HttpResponse(new Blob(['xlsx']), {
        headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${archivo}"` },
      });
    }),
  );
  return requests;
}

describe('exportar desde el panel (RF-26)', () => {
  let descargas: string[];

  beforeEach(() => {
    descargas = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:fake', revokeObjectURL: () => undefined }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('"Exportar tabla" downloads the table with the active URL filters', async () => {
    mockStaff();
    const requests = mockExport('alumnos.xlsx', 'alumnos-2026-11-12.xlsx');
    const { user } = renderApp('/vinculacion?estado=TODOS&semestre=6&grupo=B&riesgo=EN_RIESGO');

    await user.click(await screen.findByRole('button', { name: 'Exportar tabla' }));

    await waitFor(() => expect(descargas).toEqual(['alumnos-2026-11-12.xlsx']));
    expect(requests).toHaveLength(1);
    expect(Object.fromEntries(requests[0]!)).toEqual({ estado: 'TODOS', semestre: '6', grupo: 'B', riesgo: 'EN_RIESGO' });
  });

  it('"Exportar para Edumedia" downloads its own file with the same filters', async () => {
    mockStaff();
    const requests = mockExport('edumedia.xlsx', 'edumedia-2026-11-12.xlsx');
    const { user } = renderApp('/vinculacion?turno=MATUTINO');

    await user.click(await screen.findByRole('button', { name: 'Exportar para Edumedia' }));

    await waitFor(() => expect(descargas).toEqual(['edumedia-2026-11-12.xlsx']));
    expect(Object.fromEntries(requests[0]!)).toEqual({ turno: 'MATUTINO' });
  });

  it('exports without filters when the URL has none', async () => {
    mockStaff();
    const requests = mockExport('alumnos.xlsx', 'alumnos-2026-11-12.xlsx');
    const { user } = renderApp('/vinculacion');

    await user.click(await screen.findByRole('button', { name: 'Exportar tabla' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect([...requests[0]!]).toEqual([]);
  });

  it('disables the buttons and shows "Descargando…" while the file is on its way', async () => {
    mockStaff();
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => (liberar = resolve));
    server.use(
      http.get('*/api/panel/alumnos.xlsx', async () => {
        await espera;
        return new HttpResponse(new Blob(['xlsx']), {
          headers: { 'Content-Disposition': 'attachment; filename="alumnos-2026-11-12.xlsx"' },
        });
      }),
    );
    const { user } = renderApp('/vinculacion');

    await user.click(await screen.findByRole('button', { name: 'Exportar tabla' }));

    const descargando = await screen.findByRole('button', { name: 'Descargando…' });
    expect(descargando).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar para Edumedia' })).toBeDisabled();

    liberar();
    expect(await screen.findByRole('button', { name: 'Exportar tabla' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exportar para Edumedia' })).toBeEnabled();
  });

  it('shows the API error message when the export fails and allows trying again', async () => {
    mockStaff();
    server.use(
      http.get('*/api/panel/edumedia.xlsx', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para exportar.' } }, { status: 403 }),
      ),
    );
    const { user } = renderApp('/vinculacion');

    await user.click(await screen.findByRole('button', { name: 'Exportar para Edumedia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para exportar.');
    expect(descargas).toEqual([]);
    expect(screen.getByRole('button', { name: 'Exportar para Edumedia' })).toBeEnabled();
  });

  it('warns that the export uses the table filters but not the alert filter', async () => {
    mockStaff();
    renderApp('/vinculacion?alerta=sinRegistros');

    expect(await screen.findByText(/La exportación usa los filtros de la tabla, pero no el filtro de alerta/)).toBeInTheDocument();
  });

  it('shows no alert warning when there is no alert filter', async () => {
    mockStaff();
    renderApp('/vinculacion');

    await screen.findByRole('button', { name: 'Exportar tabla' });
    expect(screen.queryByText(/no el filtro de alerta/)).not.toBeInTheDocument();
  });
});
