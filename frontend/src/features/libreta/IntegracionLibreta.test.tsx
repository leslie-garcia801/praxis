import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAvance,
  buildEnlaceValidacion,
  buildExpediente,
  buildExpedienteActivo,
  buildMe,
  buildPendiente,
  buildSemana,
  buildSemanaValidacion,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const SEMANA_ID = '88888888-8888-4888-8888-888888888801';

function mockAlumno(expediente: Record<string, unknown> | null = buildExpedienteActivo()) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: expediente }))),
    http.get('*/api/expedientes/:id/avance', () => HttpResponse.json({ avance: buildAvance() })),
    http.get('*/api/semanas/pendientes', () => HttpResponse.json({ pendientes: [] })),
  );
}

const turnoLibreta = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };

describe('horas de libreta en el alumno (RF-17a, RN-19)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('RF-17a: el inicio enlaza a la captura de horas de libreta cuando el expediente está en proceso', async () => {
    mockAlumno();
    renderApp('/alumno');
    expect(await screen.findByRole('link', { name: 'Agregar horas de libreta' })).toHaveAttribute('href', '/alumno/libreta');
  });

  it('RN-19: el inicio no ofrece la captura si el expediente está suspendido', async () => {
    mockAlumno(buildExpedienteActivo({ estado: 'SUSPENDIDO' }));
    renderApp('/alumno');
    await screen.findByRole('link', { name: 'Historial' });
    expect(screen.queryByRole('link', { name: 'Agregar horas de libreta' })).not.toBeInTheDocument();
  });

  it('RF-17a: el historial marca la semana y el turno de libreta y no ofrece solicitar corrección (RN-19)', async () => {
    mockAlumno();
    server.use(
      http.get('*/api/asistencias', () =>
        HttpResponse.json({
          semana: buildSemana({
            inicio: '2026-11-02',
            id: SEMANA_ID,
            estadoValidacion: 'ENVIADA',
            deLibreta: true,
            turnosPorDia: { '2026-11-02': [{ ...turnoLibreta, puedeSolicitarCorreccion: true, correccion: null }] },
          }),
        }),
      ),
    );
    renderApp('/alumno/historial?semana=2026-11-02');
    expect(await screen.findByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument();
    expect(screen.getAllByText('Libreta')).toHaveLength(2); // week and shift
    expect(screen.queryByRole('button', { name: 'Solicitar corrección' })).not.toBeInTheDocument();
    expect(screen.getByText(/esta semana no lleva bitácora/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Actividades de la semana' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Corregir turnos' })).not.toBeInTheDocument();
  });

  it('RF-17a: una semana de libreta rechazada muestra el comentario y el enlace para corregir', async () => {
    mockAlumno();
    server.use(
      http.get('*/api/asistencias', () =>
        HttpResponse.json({
          semana: buildSemana({
            inicio: '2026-11-02',
            id: SEMANA_ID,
            estadoValidacion: 'RECHAZADA',
            comentario: 'Faltó el turno del jueves.',
            deLibreta: true,
            puedeCorregirLibreta: true,
            turnosPorDia: { '2026-11-02': [turnoLibreta] },
          }),
        }),
      ),
    );
    renderApp('/alumno/historial?semana=2026-11-02');
    expect(await screen.findByText(/Faltó el turno del jueves\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Corregir turnos' })).toHaveAttribute('href', '/alumno/libreta?corregir=2026-11-02');
  });

  it('RN-19: un turno de QR conserva el flujo de corrección y no lleva etiqueta', async () => {
    mockAlumno();
    server.use(
      http.get('*/api/asistencias', () =>
        HttpResponse.json({
          semana: buildSemana({
            inicio: '2026-11-02',
            estadoValidacion: 'BORRADOR',
            turnosPorDia: { '2026-11-02': [{ puedeSolicitarCorreccion: true, correccion: null }] },
          }),
        }),
      ),
    );
    renderApp('/alumno/historial?semana=2026-11-02');
    expect(await screen.findByRole('button', { name: 'Solicitar corrección' })).toBeInTheDocument();
    expect(screen.queryByText('Libreta')).not.toBeInTheDocument();
  });

  it('RF-17a: los pendientes de una semana de libreta rechazada llevan a corregir los turnos', async () => {
    mockAlumno();
    server.use(
      http.get('*/api/semanas/pendientes', () =>
        HttpResponse.json({
          pendientes: [
            buildPendiente({
              id: SEMANA_ID,
              semanaInicio: '2026-11-02',
              semanaFin: '2026-11-08',
              estado: 'RECHAZADA',
              motivo: 'RECHAZADA',
              comentario: 'Faltó el turno del jueves.',
              deLibreta: true,
            }),
          ],
        }),
      ),
      http.get('*/api/correcciones', () => HttpResponse.json({ correcciones: [] })),
    );
    renderApp('/alumno');
    const lista = within(await screen.findByRole('list', { name: 'Pendientes' }));
    const enlace = lista.getByRole('link', { name: 'Corrige las horas de libreta de la semana del 2 al 8 de noviembre' });
    expect(enlace).toHaveAttribute('href', '/alumno/libreta?corregir=2026-11-02');
    expect(lista.getByText('Libreta')).toBeInTheDocument();
  });
});

describe('horas de libreta en el supervisor y la oficina (RF-17a, RF-21, RF-22)', () => {
  const TOKEN = 'token-secreto-de-prueba';

  it('RF-17a: el supervisor ve la etiqueta de libreta y no una bitácora vacía', async () => {
    const libreta = buildSemanaValidacion({
      deLibreta: true,
      actividades: null,
      turnos: [
        {
          entrada: '2026-11-02T14:00:00.000Z',
          salida: '2026-11-02T20:00:00.000Z',
          estado: 'CERRADA',
          minutosAcreditables: 360,
          fueraDeHorario: false,
          origen: 'LIBRETA',
        },
      ],
    });
    server.use(http.get(`*/api/validacion/${TOKEN}`, () => HttpResponse.json({ enlace: buildEnlaceValidacion({ semanas: [libreta] }) })));
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument();
    expect(screen.getAllByText('Libreta')).toHaveLength(2);
    expect(screen.getByText(/esta semana no lleva bitácora/)).toBeInTheDocument();
    expect(screen.queryByText('Sin bitácora')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validar' })).toBeInTheDocument();
  });

  it('RF-17a, RF-22: el detalle de la oficina marca la semana de libreta y conserva las acciones de validar', async () => {
    const id = '44444444-4444-4444-8444-444444444441';
    server.use(
      http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'PRACTICAS' }))),
      http.get(`*/api/expedientes/${id}`, () => HttpResponse.json({ expediente: buildExpediente({ id, estado: 'EN_PROCESO', alumno: { id: 'al-1', nombre: 'Ana María', apellidoPaterno: 'López', apellidoMaterno: 'García', matricula: '25319051769999', carrera: 'Programación', semestre: 5, grupo: 'A', turno: 'MATUTINO' }, faltantes: [] }) })),
      http.get(`*/api/expedientes/${id}/avance`, () => HttpResponse.json({ avance: buildAvance({ expedienteId: id }) })),
      http.get(`*/api/expedientes/${id}/auditoria`, () => HttpResponse.json({ limite: 200, truncado: false, entradas: [] })),
      http.get('*/api/asistencias', () =>
        HttpResponse.json({
          semana: buildSemana({
            inicio: '2026-11-02',
            id: SEMANA_ID,
            estadoValidacion: 'ENVIADA',
            deLibreta: true,
            turnosPorDia: { '2026-11-02': [turnoLibreta] },
          }),
        }),
      ),
    );
    renderApp(`/vinculacion/expedientes/${id}`);
    const historial = within(await screen.findByRole('region', { name: 'Historial por semana' }));
    expect(await historial.findByText(/esta semana no lleva bitácora/)).toBeInTheDocument();
    expect(historial.getAllByText('Libreta')).toHaveLength(2);
    expect(historial.queryByText('Sin bitácora')).not.toBeInTheDocument();
    expect(historial.getByRole('button', { name: 'Validar en nombre del supervisor' })).toBeInTheDocument();
  });
});
