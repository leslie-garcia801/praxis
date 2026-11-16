import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  buildAvance,
  buildExpediente,
  buildMe,
  buildSemana,
  buildSupervisor,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ID = '44444444-4444-4444-8444-444444444441';
const INSTITUCION = '33333333-3333-4333-8333-333333333333';
const RUTA = `/vinculacion/expedientes/${ID}`;

const alumno = {
  id: '88888888-8888-4888-8888-888888888881',
  nombre: 'Ana María',
  apellidoPaterno: 'López',
  apellidoMaterno: 'García',
  matricula: '25319051769999',
  carrera: 'Programación',
  semestre: 6,
  grupo: 'A',
  turno: 'MATUTINO',
};

const actual = buildSupervisor({ correo: 'laura@hospital.test', telefono: null, extension: null, activo: true });
const otro = buildSupervisor({ id: 'sup-2', nombre: 'Pedro', apellidoPaterno: 'Salas', apellidoMaterno: null, titulo: null, activo: true });
const inactivo = buildSupervisor({ id: 'sup-3', nombre: 'Inés', apellidoPaterno: 'Ibarra', apellidoMaterno: null, titulo: null, activo: false });

function expedienteEn(estado: string, supervisor: unknown = actual) {
  return buildExpediente({
    id: ID,
    estado,
    tipo: 'PRACTICAS',
    institucion: { id: INSTITUCION, nombre: 'Hospital Alfa' },
    supervisor,
    alumno,
    faltantes: [],
  });
}

function mockDetalle(estado: string, supervisores: unknown[]) {
  const vigente = { expediente: expedienteEn(estado) };
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'PRACTICAS' }))),
    http.get(`*/api/expedientes/${ID}`, () => HttpResponse.json(vigente)),
    http.get(`*/api/expedientes/${ID}/avance`, () => HttpResponse.json({ avance: buildAvance({ expedienteId: ID }) })),
    http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json({ limite: 200, truncado: false, entradas: [] })),
    http.get('*/api/asistencias', () => HttpResponse.json({ semana: buildSemana({ id: null }) })),
    http.get(`*/api/instituciones/${INSTITUCION}/supervisores`, () => HttpResponse.json({ supervisores })),
  );
  return vigente;
}

async function abrirPanel(user: ReturnType<typeof renderApp>['user']) {
  await screen.findByText('Ana María López García');
  await user.click(await screen.findByRole('button', { name: 'Cambiar supervisor' }));
  return within(await screen.findByRole('form', { name: 'Cambiar supervisor' }));
}

describe('/vinculacion/expedientes/:id change supervisor (RF-12, RF-29, RN-03b)', () => {
  it.each(['PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO'])('RF-12: offers "Cambiar supervisor" on a %s case file', async (estado) => {
    mockDetalle(estado, [actual, otro]);
    renderApp(RUTA);
    expect(await screen.findByRole('button', { name: 'Cambiar supervisor' })).toBeInTheDocument();
  });

  it.each(['FINALIZADO', 'CANCELADO'])('RF-12: hides "Cambiar supervisor" on a %s case file', async (estado) => {
    mockDetalle(estado, [actual, otro]);
    renderApp(RUTA);
    await screen.findByText('Ana María López García');
    expect(screen.queryByRole('button', { name: 'Cambiar supervisor' })).not.toBeInTheDocument();
  });

  it('RF-09: lists only the active supervisors other than the current one, and links to the institution', async () => {
    mockDetalle('EN_PROCESO', [actual, otro, inactivo]);
    const { user } = renderApp(RUTA);
    const form = await abrirPanel(user);

    const select = await form.findByRole('combobox', { name: 'Supervisor nuevo' });
    const opciones = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Elige un supervisor', 'Pedro Salas']);
    expect(form.getByRole('link', { name: 'Agregar un supervisor en la institución' })).toHaveAttribute(
      'href',
      `/vinculacion/instituciones/${INSTITUCION}/editar`,
    );
  });

  it('RF-09: says so and links to the institution when there is no other active supervisor', async () => {
    mockDetalle('EN_PROCESO', [actual, inactivo]);
    const { user } = renderApp(RUTA);
    const form = await abrirPanel(user);

    expect(await form.findByText('No hay otro supervisor activo en esta institución.')).toBeInTheDocument();
    expect(form.queryByRole('combobox')).not.toBeInTheDocument();
    expect(form.getByRole('link', { name: 'Agregar un supervisor en la institución' })).toBeInTheDocument();
  });

  it('RF-29: sends the new supervisor, shows success and refreshes the detail', async () => {
    const vigente = mockDetalle('EN_PROCESO', [actual, otro]);
    const cuerpos: unknown[] = [];
    server.use(
      http.patch(`*/api/expedientes/${ID}`, async ({ request }) => {
        cuerpos.push(await request.json());
        vigente.expediente = expedienteEn('EN_PROCESO', { ...otro, correo: 'pedro@hospital.test', telefono: null, extension: null });
        return HttpResponse.json(vigente);
      }),
    );
    const { user } = renderApp(RUTA);
    const form = await abrirPanel(user);

    await user.click(form.getByRole('button', { name: 'Guardar supervisor nuevo' }));
    expect(await form.findByText('Elige el supervisor nuevo.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.selectOptions(await form.findByRole('combobox', { name: 'Supervisor nuevo' }), 'sup-2');
    await user.click(form.getByRole('button', { name: 'Guardar supervisor nuevo' }));

    await waitFor(() => expect(cuerpos).toEqual([{ supervisorId: 'sup-2' }]));
    expect(await screen.findByText('Supervisor cambiado.')).toBeInTheDocument();
    expect(await screen.findByText('Pedro Salas')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Cambiar supervisor' })).not.toBeInTheDocument();
  });

  it.each([
    ['SUPERVISOR_INACTIVO', 'El supervisor está desactivado. Elige otro.'],
    ['SUPERVISOR_DE_OTRA_INSTITUCION', 'El supervisor es de otra institución.'],
    ['EXPEDIENTE_NO_EDITABLE', 'Este expediente ya no se puede editar.'],
  ])('RF-12: shows the server error %s', async (code, message) => {
    mockDetalle('EN_PROCESO', [actual, otro]);
    server.use(http.patch(`*/api/expedientes/${ID}`, () => HttpResponse.json({ error: { code, message } }, { status: 400 })));
    const { user } = renderApp(RUTA);
    const form = await abrirPanel(user);

    await user.selectOptions(await form.findByRole('combobox', { name: 'Supervisor nuevo' }), 'sup-2');
    await user.click(form.getByRole('button', { name: 'Guardar supervisor nuevo' }));

    expect(await form.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('form', { name: 'Cambiar supervisor' })).toBeInTheDocument();
  });

  it('RF-09: shows the error when the supervisors cannot be loaded, with retry', async () => {
    mockDetalle('EN_PROCESO', []);
    let intento = 0;
    server.use(
      http.get(`*/api/instituciones/${INSTITUCION}/supervisores`, () => {
        intento += 1;
        return intento === 1
          ? HttpResponse.json({ error: { code: 'ERROR', message: 'No se pudieron cargar los supervisores.' } }, { status: 500 })
          : HttpResponse.json({ supervisores: [actual, otro] });
      }),
    );
    const { user } = renderApp(RUTA);
    const form = await abrirPanel(user);

    expect(await form.findByRole('alert')).toHaveTextContent('No se pudieron cargar los supervisores.');
    await user.click(form.getByRole('button', { name: 'Reintentar' }));
    expect(await form.findByRole('combobox', { name: 'Supervisor nuevo' })).toBeInTheDocument();
  });
});
