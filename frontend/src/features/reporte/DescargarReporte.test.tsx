import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAvance, buildExpedienteActivo, buildFilaPanel, buildInstitucion, buildMe, buildPanel, carrerasEjemplo } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const EXPEDIENTE = '44444444-4444-4444-8444-444444444441';
const PROPIO = '44444444-4444-4444-8444-444444444444';

// Serves the PDF and records the query string of each request.
function mockReporte(archivo = 'reporte-25319051769999-2026-11-12.pdf') {
  const requests: { id: string; query: URLSearchParams }[] = [];
  server.use(
    http.get('*/api/expedientes/:id/reporte.pdf', ({ request, params }) => {
      requests.push({ id: String(params.id), query: new URL(request.url).searchParams });
      return new HttpResponse(new Blob(['%PDF']), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${archivo}"` },
      });
    }),
  );
  return requests;
}

function mockAlumno() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo({ id: PROPIO }) }))),
    http.get('*/api/expedientes/:id/avance', () => HttpResponse.json({ avance: buildAvance() })),
  );
}

function mockStaff() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'SERVICIO_SOCIAL' }))),
    http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
    http.get('*/api/instituciones', () => HttpResponse.json({ instituciones: [buildInstitucion()] })),
    http.get('*/api/panel/alumnos', () => HttpResponse.json(buildPanel({ alumnos: [buildFilaPanel()] }))),
  );
}

describe('DescargarReporte (RF-27)', () => {
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

  it('the student screen shows the button and downloads their own case file without a range', async () => {
    mockAlumno();
    const requests = mockReporte();
    const { user } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Descargar reporte' }));

    await waitFor(() => expect(descargas).toEqual(['reporte-25319051769999-2026-11-12.pdf']));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.id).toBe(PROPIO);
    expect([...requests[0]!.query]).toEqual([]);
  });

  it('sends desde and hasta as query params', async () => {
    mockAlumno();
    const requests = mockReporte();
    const { user } = renderApp('/alumno');

    await user.type(await screen.findByLabelText('Desde'), '2026-03-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-03-31');
    await user.click(screen.getByRole('button', { name: 'Descargar reporte' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(Object.fromEntries(requests[0]!.query)).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
  });

  it('does not download when desde is after hasta and says why', async () => {
    mockAlumno();
    const requests = mockReporte();
    const { user } = renderApp('/alumno');

    await user.type(await screen.findByLabelText('Hasta'), '2026-03-01');
    await user.type(screen.getByLabelText('Desde'), '2026-03-10');
    await user.click(screen.getByRole('button', { name: 'Descargar reporte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha inicial no puede ser posterior a la fecha final.');
    expect(requests).toHaveLength(0);
  });

  it('shows "Descargando…" while the file is on its way', async () => {
    mockAlumno();
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => (liberar = resolve));
    server.use(
      http.get('*/api/expedientes/:id/reporte.pdf', async () => {
        await espera;
        return new HttpResponse(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="r.pdf"' } });
      }),
    );
    const { user } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Descargar reporte' }));

    expect(await screen.findByRole('button', { name: 'Descargando…' })).toBeDisabled();
    liberar();
    expect(await screen.findByRole('button', { name: 'Descargar reporte' })).toBeEnabled();
  });

  it('shows the API error message when the download fails', async () => {
    mockAlumno();
    server.use(
      http.get('*/api/expedientes/:id/reporte.pdf', () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' } }, { status: 403 }),
      ),
    );
    const { user } = renderApp('/alumno');

    await user.click(await screen.findByRole('button', { name: 'Descargar reporte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para realizar esta acción.');
  });

  it('panel row action opens the report form and downloads that case file', async () => {
    mockStaff();
    const requests = mockReporte();
    const { user } = renderApp('/vinculacion');

    expect(screen.queryByRole('button', { name: 'Descargar reporte' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Reporte de Ana María López García' }));
    await user.click(await screen.findByRole('button', { name: 'Descargar reporte' }));

    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(requests[0]!.id).toBe(EXPEDIENTE);
  });
});
