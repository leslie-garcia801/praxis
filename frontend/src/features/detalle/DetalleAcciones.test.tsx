import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  buildAvance,
  buildExpediente,
  buildInstitucion,
  buildMe,
  buildSemana,
  buildSupervisor,
} from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const ID = '44444444-4444-4444-8444-444444444441';
const NUEVO = '44444444-4444-4444-8444-444444444499';
const SEMANA_ID = '66666666-6666-4666-8666-666666666601';
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

const supervisor = buildSupervisor({ correo: 'laura@hospital.test', telefono: '8112345678', extension: '12' });

function expedienteEn(estado: string) {
  return buildExpediente({
    id: ID,
    estado,
    tipo: 'PRACTICAS',
    fechaInicio: '2026-03-02',
    fechaTermino: '2026-08-28',
    diasPactados: [1, 3, 5],
    horaEntrada: '08:00',
    horaSalida: '12:00',
    institucion: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Hospital Alfa' },
    supervisor,
    alumno,
    faltantes: [],
  });
}

function mockDetalle(estado: string, semana = buildSemana({ id: null })) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'PRACTICAS' }))),
    http.get(`*/api/expedientes/${ID}`, () => HttpResponse.json({ expediente: expedienteEn(estado) })),
    http.get(`*/api/expedientes/${ID}/avance`, () => HttpResponse.json({ avance: buildAvance({ expedienteId: ID }) })),
    http.get(`*/api/expedientes/${ID}/auditoria`, () => HttpResponse.json({ limite: 200, truncado: false, entradas: [] })),
    http.get('*/api/asistencias', () => HttpResponse.json({ semana })),
  );
}

const semanaEnviada = () => buildSemana({ id: SEMANA_ID, estadoValidacion: 'ENVIADA', actividades: 'Apoyé en el archivo.' });

async function esperarDetalle() {
  await screen.findByText('Ana María López García');
  return within(await screen.findByRole('group', { name: 'Acciones del expediente' }));
}

// Records the JSON body of the matching request.
function capturar(metodo: 'patch' | 'post', ruta: string, respuesta: unknown, status = 200) {
  const cuerpos: unknown[] = [];
  server.use(
    http[metodo](ruta, async ({ request }) => {
      cuerpos.push(await request.json().catch(() => undefined));
      return HttpResponse.json(respuesta as object, { status });
    }),
  );
  return cuerpos;
}

describe('/vinculacion/expedientes/:id office actions (RF-12, RF-22, RN-12, RN-03b)', () => {
  it.each([
    ['PENDIENTE', ['Confirmar', 'Cancelar']],
    ['EN_PROCESO', ['Suspender', 'Cancelar', 'Transferir']],
    ['SUSPENDIDO', ['Reactivar', 'Cancelar', 'Transferir']],
  ])('RF-12: shows the actions of a %s case file', async (estado, botones) => {
    mockDetalle(estado);
    renderApp(RUTA);

    const acciones = await esperarDetalle();
    expect(acciones.getAllByRole('button').map((b) => b.textContent)).toEqual(botones);
  });

  it.each(['FINALIZADO', 'CANCELADO'])('RF-12: a %s case file has no actions', async (estado) => {
    mockDetalle(estado);
    renderApp(RUTA);

    await screen.findByText('Ana María López García');
    expect(screen.queryByRole('group', { name: 'Acciones del expediente' })).not.toBeInTheDocument();
  });

  it('RF-12: the reason is required and the request carries it', async () => {
    mockDetalle('EN_PROCESO');
    const cuerpos = capturar('patch', `*/api/expedientes/${ID}/estado`, { expediente: expedienteEn('SUSPENDIDO') });
    const { user } = renderApp(RUTA);
    const acciones = await esperarDetalle();

    await user.click(acciones.getByRole('button', { name: 'Suspender' }));
    const form = within(screen.getByRole('form', { name: 'Suspender expediente' }));
    await user.click(form.getByRole('button', { name: 'Suspender expediente' }));

    expect(await form.findByText('Indica el motivo.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.type(form.getByLabelText('Motivo'), 'Licencia médica');
    await user.click(form.getByRole('button', { name: 'Suspender expediente' }));

    await waitFor(() => expect(cuerpos).toEqual([{ accion: 'SUSPENDER', motivo: 'Licencia médica' }]));
  });

  it('RF-12: shows the API error of an action', async () => {
    mockDetalle('EN_PROCESO');
    server.use(
      http.patch(`*/api/expedientes/${ID}/estado`, () =>
        HttpResponse.json({ error: { code: 'TRANSICION_NO_PERMITIDA', message: 'Solo se puede suspender un expediente en proceso.' } }, { status: 409 }),
      ),
    );
    const { user } = renderApp(RUTA);
    const acciones = await esperarDetalle();

    await user.click(acciones.getByRole('button', { name: 'Suspender' }));
    const form = within(screen.getByRole('form', { name: 'Suspender expediente' }));
    await user.type(form.getByLabelText('Motivo'), 'Licencia');
    await user.click(form.getByRole('button', { name: 'Suspender expediente' }));

    expect(await form.findByRole('alert')).toHaveTextContent('Solo se puede suspender un expediente en proceso.');
  });

  it('RF-12: cancelling asks for confirmation before sending', async () => {
    mockDetalle('EN_PROCESO');
    const cuerpos = capturar('patch', `*/api/expedientes/${ID}/estado`, { expediente: expedienteEn('CANCELADO') });
    const { user } = renderApp(RUTA);
    const acciones = await esperarDetalle();

    await user.click(acciones.getByRole('button', { name: 'Cancelar' }));
    const form = within(screen.getByRole('form', { name: 'Cancelar expediente' }));
    await user.type(form.getByLabelText('Motivo'), 'El alumno se dio de baja');
    await user.click(form.getByRole('button', { name: 'Cancelar expediente' }));

    const dialogo = within(await screen.findByRole('alertdialog'));
    expect(cuerpos).toHaveLength(0);
    await user.click(dialogo.getByRole('button', { name: 'Volver' }));
    expect(cuerpos).toHaveLength(0);

    await user.click(form.getByRole('button', { name: 'Cancelar expediente' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, continuar' }));

    await waitFor(() => expect(cuerpos).toEqual([{ accion: 'CANCELAR', motivo: 'El alumno se dio de baja' }]));
  });

  it('RN-12: transfers to another institution, asks for confirmation and opens the new case file', async () => {
    mockDetalle('EN_PROCESO');
    server.use(
      http.get('*/api/instituciones', () =>
        HttpResponse.json({ instituciones: [buildInstitucion({ id: '33333333-3333-4333-8333-333333333399', nombre: 'Clínica Beta' })] }),
      ),
      http.get(`*/api/expedientes/${NUEVO}`, () => HttpResponse.json({ expediente: { ...expedienteEn('PENDIENTE'), id: NUEVO } })),
    );
    const cuerpos = capturar('post', `*/api/expedientes/${ID}/transferir`, { anterior: { id: ID }, nuevo: { id: NUEVO } }, 201);
    const { user, router } = renderApp(RUTA);
    const acciones = await esperarDetalle();

    await user.click(acciones.getByRole('button', { name: 'Transferir' }));
    const form = within(screen.getByRole('form', { name: 'Transferir expediente' }));
    await user.type(form.getByLabelText('Motivo'), 'Cambio de domicilio');
    await user.click(form.getByRole('button', { name: 'Transferir expediente' }));
    expect(await form.findByText('Elige la institución nueva.')).toBeInTheDocument();

    await user.click(await form.findByRole('radio', { name: /Clínica Beta/ }));
    await user.click(form.getByRole('checkbox', { name: 'Conservar horas validadas' }));
    await user.click(form.getByRole('button', { name: 'Transferir expediente' }));
    expect(cuerpos).toHaveLength(0);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, continuar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/vinculacion/expedientes/${NUEVO}`));
    expect(cuerpos).toEqual([
      { institucionId: '33333333-3333-4333-8333-333333333399', conservarHoras: false, motivo: 'Cambio de domicilio' },
    ]);
  });

  it('RF-10: confirming shows what is missing when the API answers 409', async () => {
    mockDetalle('PENDIENTE');
    server.use(
      http.post(`*/api/expedientes/${ID}/confirmar`, () =>
        HttpResponse.json(
          { error: { code: 'EXPEDIENTE_INCOMPLETO', message: 'Faltan datos para confirmar el expediente.', details: { faltantes: ['supervisorId', 'fechaInicio'] } } },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp(RUTA);
    const acciones = await esperarDetalle();

    await user.click(acciones.getByRole('button', { name: 'Confirmar' }));

    const alerta = await acciones.findByRole('alert');
    expect(alerta).toHaveTextContent('Faltan datos para confirmar el expediente.');
    expect(within(alerta).getByText('Supervisor')).toBeInTheDocument();
    expect(within(alerta).getByText('Fecha de inicio')).toBeInTheDocument();
  });

  it('RF-22: validates an ENVIADA week on behalf of the supervisor with a reason', async () => {
    mockDetalle('EN_PROCESO', semanaEnviada());
    const cuerpos = capturar('post', `*/api/semanas/${SEMANA_ID}/validacion`, { semana: { id: SEMANA_ID, estado: 'VALIDADA' } });
    const { user } = renderApp(RUTA);

    const acciones = within(await screen.findByRole('group', { name: 'Acciones de la semana' }));
    await user.click(acciones.getByRole('button', { name: 'Validar en nombre del supervisor' }));
    const form = within(screen.getByRole('form', { name: 'Validar semana en nombre del supervisor' }));
    await user.click(form.getByRole('button', { name: 'Validar semana' }));
    expect(await form.findByText('Indica el motivo.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.type(form.getByLabelText('Motivo'), 'El supervisor no responde');
    await user.click(form.getByRole('button', { name: 'Validar semana' }));

    await waitFor(() => expect(cuerpos).toEqual([{ accion: 'VALIDAR', motivo: 'El supervisor no responde' }]));
  });

  it('RF-22: rejecting needs a comment for the student', async () => {
    mockDetalle('EN_PROCESO', semanaEnviada());
    const cuerpos = capturar('post', `*/api/semanas/${SEMANA_ID}/validacion`, { semana: { id: SEMANA_ID, estado: 'RECHAZADA' } });
    const { user } = renderApp(RUTA);

    const acciones = within(await screen.findByRole('group', { name: 'Acciones de la semana' }));
    await user.click(acciones.getByRole('button', { name: 'Rechazar' }));
    const form = within(screen.getByRole('form', { name: 'Rechazar semana' }));
    await user.type(form.getByLabelText('Motivo'), 'Bitácora incompleta');
    await user.click(form.getByRole('button', { name: 'Rechazar semana' }));

    expect(await form.findByText('Escribe al menos 5 caracteres para explicar el rechazo.')).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);

    await user.type(form.getByLabelText('Comentario para el alumno'), 'Faltan actividades del jueves.');
    await user.click(form.getByRole('button', { name: 'Rechazar semana' }));

    await waitFor(() =>
      expect(cuerpos).toEqual([{ accion: 'RECHAZAR', motivo: 'Bitácora incompleta', comentario: 'Faltan actividades del jueves.' }]),
    );
  });

  it('RF-22: a week that is not ENVIADA has no validation actions', async () => {
    mockDetalle('EN_PROCESO', buildSemana({ id: SEMANA_ID, estadoValidacion: 'VALIDADA' }));
    renderApp(RUTA);

    await screen.findByText('Ana María López García');
    await screen.findByText('Validada');
    expect(screen.queryByRole('group', { name: 'Acciones de la semana' })).not.toBeInTheDocument();
  });

  it('RF-09: editing the supervisor sends a PATCH with the changed data', async () => {
    mockDetalle('EN_PROCESO');
    const cuerpos = capturar('patch', `*/api/supervisores/${supervisor.id}`, { supervisor });
    const { user } = renderApp(RUTA);
    await esperarDetalle();

    await user.click(screen.getByRole('button', { name: 'Editar supervisor' }));
    const form = within(screen.getByRole('form', { name: 'Editar supervisor' }));
    const nombre = form.getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Lucía');
    await user.clear(form.getByLabelText('Extensión (opcional)'));
    await user.click(form.getByRole('button', { name: 'Guardar supervisor' }));

    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(cuerpos[0]).toMatchObject({
      titulo: 'Lic.',
      nombre: 'Lucía',
      apellidoPaterno: 'Mendoza',
      correo: 'laura@hospital.test',
      telefono: '8112345678',
      extension: null,
    });
  });

  it('RF-09: the supervisor form validates the required fields and shows API errors', async () => {
    mockDetalle('EN_PROCESO');
    server.use(
      http.patch(`*/api/supervisores/${supervisor.id}`, () =>
        HttpResponse.json({ error: { code: 'VALIDACION', message: 'El correo no es válido.' } }, { status: 400 }),
      ),
    );
    const { user } = renderApp(RUTA);
    await esperarDetalle();

    await user.click(screen.getByRole('button', { name: 'Editar supervisor' }));
    const form = within(screen.getByRole('form', { name: 'Editar supervisor' }));
    await user.clear(form.getByLabelText('Nombre'));
    await user.click(form.getByRole('button', { name: 'Guardar supervisor' }));
    expect(await form.findByText('Escribe el nombre del supervisor.')).toBeInTheDocument();

    await user.type(form.getByLabelText('Nombre'), 'Lucía');
    await user.click(form.getByRole('button', { name: 'Guardar supervisor' }));
    expect(await form.findByRole('alert')).toHaveTextContent('El correo no es válido.');
  });
});
