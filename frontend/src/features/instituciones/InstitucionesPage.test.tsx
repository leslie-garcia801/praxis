import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInstitucion, buildMe, carrerasEjemplo } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const LISTA_URL = '*/api/instituciones';
const ID = '33333333-3333-4333-8333-333333333333';

function mockStaff() {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))),
    http.get('*/api/carreras', () => HttpResponse.json({ carreras: carrerasEjemplo })),
  );
}

function apiError(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

describe('/vinculacion/instituciones (RF-05, RF-06)', () => {
  it('is reachable from the panel', async () => {
    mockStaff();
    server.use(http.get(LISTA_URL, () => HttpResponse.json({ instituciones: [] })));
    const { user } = renderApp('/vinculacion');
    await user.click(await screen.findByRole('link', { name: 'Instituciones' }));
    expect(await screen.findByRole('heading', { name: 'Instituciones' })).toBeInTheDocument();
    // One in the menu and one in the page header.
    expect(screen.getAllByRole('link', { name: 'Importar instituciones' })).toHaveLength(2);
  });

  it('requires the vinculación or admin role', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'ALUMNO' }))));
    renderApp('/vinculacion/instituciones');
    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
  });

  it('shows a loading state', async () => {
    mockStaff();
    server.use(
      http.get(LISTA_URL, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ instituciones: [buildInstitucion()] });
      }),
    );
    renderApp('/vinculacion/instituciones');
    expect(await screen.findByText('Cargando instituciones…')).toBeInTheDocument();
    expect(await screen.findByText('Hospital Alfa')).toBeInTheDocument();
  });

  it('shows the API error and retries', async () => {
    mockStaff();
    let calls = 0;
    server.use(
      http.get(LISTA_URL, () => {
        calls += 1;
        return calls === 1
          ? apiError('ERROR_INTERNO', 'Ocurrió un error inesperado.', 500)
          : HttpResponse.json({ instituciones: [buildInstitucion()] });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Hospital Alfa')).toBeInTheDocument();
  });

  it('shows an empty state and a link to create an institution', async () => {
    mockStaff();
    server.use(http.get(LISTA_URL, () => HttpResponse.json({ instituciones: [] })));
    renderApp('/vinculacion/instituciones');
    expect(await screen.findByText('No se encontraron instituciones.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva institución' })).toHaveAttribute(
      'href',
      '/vinculacion/instituciones/nueva',
    );
  });

  it('lists name, municipio, cupo, estado and codigo corto, with "Sin dato" for a null cupo', async () => {
    mockStaff();
    server.use(
      http.get(LISTA_URL, () =>
        HttpResponse.json({
          instituciones: [
            buildInstitucion(),
            buildInstitucion({
              id: 'b',
              nombre: 'Clínica Beta',
              municipio: 'Monterrey',
              cupo: null,
              activa: false,
              codigoCorto: 'ZZZ999',
            }),
          ],
        }),
      ),
    );
    renderApp('/vinculacion/instituciones');

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Hospital Alfa');
    expect(rows[1]).toHaveTextContent('Guadalupe');
    expect(rows[1]).toHaveTextContent('5');
    expect(rows[1]).toHaveTextContent('Activa');
    expect(rows[1]).toHaveTextContent('ABC234');
    expect(rows[2]).toHaveTextContent('Clínica Beta');
    expect(rows[2]).toHaveTextContent('Sin dato');
    expect(rows[2]).toHaveTextContent('Inactiva');
    expect(within(rows[1]!).getByRole('link', { name: 'Editar Hospital Alfa' })).toHaveAttribute(
      'href',
      `/vinculacion/instituciones/${ID}/editar`,
    );
  });

  it('RF-06: sends the filters as query params and explains that "con cupo" excludes "sin dato"', async () => {
    mockStaff();
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(LISTA_URL, ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ instituciones: [buildInstitucion()] });
      }),
    );
    const { user } = renderApp('/vinculacion/instituciones');
    await screen.findByText('Hospital Alfa');
    expect(queries[0]?.toString()).toBe('');

    await user.type(screen.getByLabelText('Buscar'), 'alfa');
    await user.type(screen.getByLabelText('Municipio'), 'Guadalupe');
    await screen.findByRole('option', { name: 'Programación' });
    await user.selectOptions(screen.getByLabelText('Carrera'), 'Programación');
    await user.selectOptions(screen.getByLabelText('Turno'), 'Matutino');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Servicio social');
    await user.click(screen.getByLabelText('Solo con cupo'));
    expect(screen.getByText(/no incluye las instituciones sin dato de cupo/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(queries.length).toBeGreaterThan(1));
    const last = queries.at(-1)!;
    expect(last.get('q')).toBe('alfa');
    expect(last.get('municipio')).toBe('Guadalupe');
    expect(last.get('carrera')).toBe(carrerasEjemplo[1]!.id);
    expect(last.get('turno')).toBe('MATUTINO');
    expect(last.get('tipo')).toBe('SERVICIO_SOCIAL');
    expect(last.get('conCupo')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(queries.at(-1)!.toString()).toBe(''));
  });

  describe('QR (RF-13, RF-15)', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    let clicked: string[];

    beforeEach(() => {
      clicked = [];
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('asks for confirmation, downloads the PDF and refreshes the codigo corto', async () => {
      mockStaff();
      let codigo = 'ABC234';
      let qrCalls = 0;
      server.use(
        http.get(LISTA_URL, () => HttpResponse.json({ instituciones: [buildInstitucion({ codigoCorto: codigo })] })),
        http.post(`*/api/instituciones/${ID}/qr`, () => {
          qrCalls += 1;
          codigo = 'NEW777';
          return new HttpResponse(new Blob(['%PDF']), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="qr-hospital-alfa.pdf"',
            },
          });
        }),
      );
      const { user } = renderApp('/vinculacion/instituciones');
      await user.click(await screen.findByRole('button', { name: 'Descargar QR de Hospital Alfa' }));

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Hospital Alfa');
      expect(dialog).toHaveTextContent(/se generan un QR y un código corto nuevos/i);
      expect(dialog).toHaveTextContent(/el que ya imprimiste deja de funcionar/i);
      expect(qrCalls).toBe(0);

      await user.click(within(dialog).getByRole('button', { name: 'Generar y descargar' }));

      expect(await screen.findByText('NEW777')).toBeInTheDocument();
      expect(qrCalls).toBe(1);
      expect(clicked).toEqual(['qr-hospital-alfa.pdf']);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('status')).toHaveTextContent('qr-hospital-alfa.pdf');
    });

    it('does nothing when the confirmation is cancelled', async () => {
      mockStaff();
      let qrCalls = 0;
      server.use(
        http.get(LISTA_URL, () => HttpResponse.json({ instituciones: [buildInstitucion()] })),
        http.post(`*/api/instituciones/${ID}/qr`, () => {
          qrCalls += 1;
          return new HttpResponse(new Blob(['%PDF']));
        }),
      );
      const { user } = renderApp('/vinculacion/instituciones');
      await user.click(await screen.findByRole('button', { name: 'Descargar QR de Hospital Alfa' }));
      await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(qrCalls).toBe(0);
    });

    it('keeps the dialog open and shows the API message when the download fails', async () => {
      mockStaff();
      server.use(
        http.get(LISTA_URL, () => HttpResponse.json({ instituciones: [buildInstitucion()] })),
        http.post(`*/api/instituciones/${ID}/qr`, () => apiError('NO_ENCONTRADO', 'La institución no existe.', 404)),
      );
      const { user } = renderApp('/vinculacion/instituciones');
      await user.click(await screen.findByRole('button', { name: 'Descargar QR de Hospital Alfa' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Generar y descargar' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('La institución no existe.');
      expect(clicked).toEqual([]);
    });
  });
});
