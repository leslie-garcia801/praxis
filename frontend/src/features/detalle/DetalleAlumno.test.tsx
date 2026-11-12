import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAvance,
  buildExpediente,
  buildFilaPanel,
  buildMe,
  buildPanel,
  buildSemana,
  buildSupervisor,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ID = '44444444-4444-4444-8444-444444444441';
const RUTA = `/vinculacion/expedientes/${ID}`;

const alumno = {
  id: '88888888-8888-4888-8888-888888888881',
  nombre: 'Ana María',
  apellidoPaterno: 'López',
  apellidoMaterno: 'García',
  matricula: '25319051769999',
  carrera: 'Programación',
  semestre: 5,
  grupo: 'A',
  turno: 'MATUTINO',
};

const expediente = buildExpediente({
  id: ID,
  estado: 'EN_PROCESO',
  tipo: 'PRACTICAS',
  departamento: 'Sistemas',
  fechaInicio: '2026-03-02',
  fechaTermino: '2026-08-28',
  diasPactados: [1, 3, 5],
  horaEntrada: '08:00',
  horaSalida: '12:00',
  metaHoras: 240,
  institucion: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Hospital Alfa' },
  supervisor: buildSupervisor({ correo: 'laura@hospital.test', telefono: '8112345678', extension: '12' }),
  alumno,
  faltantes: [],
});

const auditoria = {
  limite: 200,
  truncado: false,
  entradas: [
    {
      id: 'a2',
      fecha: '2026-03-12T15:00:00.000Z', // 09:00 in Monterrey
      usuario: 'Sistema',
      accion: 'VALIDAR_SEMANA',
      entidad: 'SemanaBitacora',
      antes: { estado: 'ENVIADA' },
      despues: { estado: 'VALIDADA', supervisorId: 's1' },
    },
    {
      id: 'a1',
      fecha: '2026-03-10T15:00:00.000Z',
      usuario: 'Marisol Vinculación',
      accion: 'SUSPENDER_EXPEDIENTE',
      entidad: 'Expediente',
      antes: { estado: 'EN_PROCESO' },
      despues: { estado: 'SUSPENDIDO', motivo: 'Licencia médica' },
    },
  ],
};

function mockStaff() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'PRACTICAS' }))));
}

// Serves the detail and records the query string of every week request.
function mockDetalle({ semanas = (inicio: string) => buildSemana({ inicio }) } = {}) {
  const semanasPedidas: URLSearchParams[] = [];
  server.use(
    http.get(`*/api/expedientes/${ID}`, () => HttpResponse.json({ expediente })),
    http.get(`*/api/expedientes/${ID}/avance`, () => HttpResponse.json({ avance: buildAvance({ expedienteId: ID }) })),
    http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json(auditoria)),
    http.get('*/api/asistencias', ({ request }) => {
      const params = new URL(request.url).searchParams;
      semanasPedidas.push(params);
      return HttpResponse.json({ semana: semanas(params.get('semana') ?? '2026-11-09') });
    }),
  );
  return semanasPedidas;
}

// Waits for the section: the page renders it once the session and the expediente are loaded.
async function seccion(nombre: string) {
  return within(await screen.findByRole('region', { name: nombre }));
}

describe('/vinculacion/expedientes/:id student detail (RF-25, RF-29, RN-03b)', () => {
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

  it('renders the header, the expediente and the progress', async () => {
    mockStaff();
    mockDetalle();
    renderApp(RUTA);

    expect(await screen.findByRole('heading', { name: 'Detalle del alumno' })).toBeInTheDocument();
    expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();
    expect(screen.getByText(/25319051769999 · Prácticas profesionales/)).toBeInTheDocument();

    const datos = await seccion('Expediente');
    expect(datos.getByText('Hospital Alfa')).toBeInTheDocument();
    expect(datos.getByText('Lic. Laura Mendoza Ruiz')).toBeInTheDocument();
    expect(datos.getByText(/laura@hospital\.test · Tel\. 8112345678 ext\. 12/)).toBeInTheDocument();
    expect(datos.getByText('Lunes, Miércoles, Viernes')).toBeInTheDocument();
    expect(datos.getByText('08:00 a 12:00')).toBeInTheDocument();
    expect(datos.getByText('Sistemas')).toBeInTheDocument();

    const avance = await seccion('Avance');
    expect(await avance.findByText(/12 h 30 min validadas de 480 h \(2 %\)/)).toBeInTheDocument();
    expect(avance.getByText('15 h')).toBeInTheDocument();
    expect(avance.getByText(/Terminaría aproximadamente el/)).toBeInTheDocument();
  });

  it('loads the week of this case file and navigates to the previous and next ones', async () => {
    mockStaff();
    const pedidas = mockDetalle({
      semanas: (inicio) =>
        buildSemana({
          inicio,
          estadoValidacion: 'VALIDADA',
          actividades: `Bitácora de la semana ${inicio}`,
          // 16:00Z is 10:00 in Monterrey (UTC-6).
          turnosPorDia: { [inicio]: [{ entrada: `${inicio}T16:00:00.000Z`, salida: `${inicio}T20:00:00.000Z` }] },
        }),
    });
    const { user } = renderApp(`${RUTA}?semana=2026-11-02`);

    const historial = await seccion('Historial por semana');
    expect(await historial.findByText('Bitácora de la semana 2026-11-02')).toBeInTheDocument();
    expect(pedidas[0]!.get('expedienteId')).toBe(ID);
    expect(pedidas[0]!.get('semana')).toBe('2026-11-02');
    expect(historial.getByText('Validada')).toBeInTheDocument();
    expect(historial.getByText(/10:00 – 14:00/)).toBeInTheDocument();
    expect(historial.getByText('Total de la semana: 4 h')).toBeInTheDocument();

    await user.click(historial.getByRole('button', { name: 'Semana anterior' }));
    expect(await historial.findByText('Bitácora de la semana 2026-10-26')).toBeInTheDocument();

    await user.click(historial.getByRole('button', { name: 'Semana siguiente' }));
    await user.click(historial.getByRole('button', { name: 'Semana siguiente' }));
    expect(await historial.findByText('Bitácora de la semana 2026-11-09')).toBeInTheDocument();
    expect(pedidas.map((p) => p.get('semana'))).toEqual(
      expect.arrayContaining(['2026-11-02', '2026-10-26', '2026-11-09']),
    );
  });

  it('shows a week without records and without logbook', async () => {
    mockStaff();
    mockDetalle({ semanas: (inicio) => buildSemana({ inicio, id: null }) });
    renderApp(RUTA);

    const historial = await seccion('Historial por semana');
    expect(await historial.findByText('No hay registros esta semana')).toBeInTheDocument();
    expect(historial.getByText('La semana aún no tiene registros ni bitácora')).toBeInTheDocument();
    expect(historial.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('RN-15: renders the audit list newest first with Spanish labels and compact changes', async () => {
    mockStaff();
    mockDetalle();
    renderApp(RUTA);

    const tabla = within(await screen.findByRole('table'));
    const filas = tabla.getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    // 15:00Z on March 12 is 09:00 in Monterrey (UTC-6, before DST).
    expect(within(filas[0]!).getByText('Semana validada')).toBeInTheDocument();
    expect(within(filas[0]!).getByText('Sistema')).toBeInTheDocument();
    expect(within(filas[0]!).getByText(/09:00/)).toBeInTheDocument();
    expect(within(filas[0]!).getByText('Estado: Enviada → Validada')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Expediente suspendido')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Marisol Vinculación')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Estado: En proceso → Suspendido')).toBeInTheDocument();
    expect(within(filas[1]!).getByText('Motivo: — → Licencia médica')).toBeInTheDocument();
  });

  it('shows an empty state and the cap notice for the audit', async () => {
    mockStaff();
    mockDetalle();
    server.use(http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json({ limite: 200, truncado: false, entradas: [] })));
    renderApp(RUTA);
    expect(await screen.findByText('Aún no hay movimientos registrados')).toBeInTheDocument();
  });

  it('shows the cap notice when the audit was truncated', async () => {
    mockStaff();
    mockDetalle();
    server.use(http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json({ ...auditoria, truncado: true })));
    renderApp(RUTA);
    expect(await screen.findByText('Se muestran los 200 movimientos más recientes.')).toBeInTheDocument();
  });

  it('downloads the report of this case file from the detail', async () => {
    mockStaff();
    mockDetalle();
    const ids: string[] = [];
    server.use(
      http.get('*/api/expedientes/:id/reporte.pdf', ({ params }) => {
        ids.push(String(params.id));
        return new HttpResponse(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="reporte.pdf"' } });
      }),
    );
    const { user } = renderApp(RUTA);

    const reporte = await seccion('Reporte');
    await user.click(await reporte.findByRole('button', { name: 'Descargar reporte' }));

    await waitFor(() => expect(descargas).toEqual(['reporte.pdf']));
    expect(ids).toEqual([ID]);
  });

  it('shows the API message for a 403 or a 404 without retry', async () => {
    mockStaff();
    server.use(
      http.get(`*/api/expedientes/${ID}`, () =>
        HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'El expediente no existe.' } }, { status: 404 }),
      ),
    );
    renderApp(RUTA);

    expect(await screen.findByRole('alert')).toHaveTextContent('El expediente no existe.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows the error of the expediente with "Reintentar" and recovers', async () => {
    mockStaff();
    mockDetalle();
    let llamadas = 0;
    server.use(
      http.get(`*/api/expedientes/${ID}`, () => {
        llamadas += 1;
        return llamadas === 1
          ? HttpResponse.json({ error: { code: 'INTERNAL', message: 'Error del servidor.' } }, { status: 500 })
          : HttpResponse.json({ expediente });
      }),
    );
    const { user } = renderApp(RUTA);

    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana María López García')).toBeInTheDocument();
  });

  it('shows the errors of the week and of the audit without breaking the rest', async () => {
    mockStaff();
    mockDetalle();
    server.use(
      http.get('*/api/asistencias', () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'Error en el historial.' } }, { status: 500 })),
      http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Sin acceso a la auditoría.' } }, { status: 403 })),
    );
    renderApp(RUTA);

    expect(await (await seccion('Historial por semana')).findByRole('alert')).toHaveTextContent('Error en el historial.');
    expect(await (await seccion('Auditoría')).findByRole('alert')).toHaveTextContent('Sin acceso a la auditoría.');
    expect(screen.getByText('Ana María López García')).toBeInTheDocument();
  });

  it('the panel links the student name to the detail', async () => {
    mockStaff();
    server.use(http.get('*/api/panel/alumnos', () => HttpResponse.json(buildPanel({ alumnos: [buildFilaPanel()] }))));
    mockDetalle();
    const { user, router } = renderApp('/vinculacion');

    await user.click(await screen.findByRole('link', { name: 'Ana María López García' }));

    expect(router.state.location.pathname).toBe(RUTA);
    expect(await screen.findByRole('heading', { name: 'Detalle del alumno' })).toBeInTheDocument();
  });
});
