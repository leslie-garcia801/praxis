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

// The progress the office sees: the goal reached (nothing missing) or `faltan` minutes short of it.
const avanceConFaltantes = (faltan: number) =>
  buildAvance({ expedienteId: ID, metaMinutos: 14400, minutosValidados: 14400 - faltan, minutosFaltantes: faltan });

function mockDetalle(estado: string, semana = buildSemana({ id: null }), avance: Record<string, unknown> = buildAvance({ expedienteId: ID })) {
  server.use(
    http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION', oficina: 'PRACTICAS' }))),
    http.get(`*/api/expedientes/${ID}`, () => HttpResponse.json({ expediente: expedienteEn(estado) })),
    http.get(`*/api/expedientes/${ID}/avance`, () => HttpResponse.json({ avance })),
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
    ['EN_PROCESO', ['Suspender', 'Finalizar', 'Cancelar', 'Transferir']],
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

  describe('RF-12: Finalizar (the goal must be validated)', () => {
    it('is disabled with the reason while hours are missing, and sends nothing', async () => {
      mockDetalle('EN_PROCESO', buildSemana({ id: null }), avanceConFaltantes(750));
      const cuerpos = capturar('patch', `*/api/expedientes/${ID}/estado`, { expediente: expedienteEn('FINALIZADO') });
      const { user } = renderApp(RUTA);
      const acciones = await esperarDetalle();

      const boton = await waitFor(() => {
        const b = acciones.getByRole('button', { name: 'Finalizar' });
        expect(b).toBeDisabled();
        return b;
      });
      expect(acciones.getByText('Faltan 12 h 30 min validadas para la meta.')).toBeInTheDocument();
      expect(boton).toHaveAccessibleDescription('Faltan 12 h 30 min validadas para la meta.');
      await user.click(boton);
      expect(screen.queryByRole('form', { name: 'Finalizar expediente' })).not.toBeInTheDocument();
      expect(cuerpos).toHaveLength(0);
    });

    it('is disabled while the progress loads', async () => {
      mockDetalle('EN_PROCESO');
      server.use(http.get(`*/api/expedientes/${ID}/avance`, () => new Promise(() => {})));
      renderApp(RUTA);
      const acciones = await esperarDetalle();

      expect(acciones.getByRole('button', { name: 'Finalizar' })).toBeDisabled();
    });

    it('is enabled with the goal validated, asks the reason and a confirmation, then sends FINALIZAR and refreshes', async () => {
      mockDetalle('EN_PROCESO', buildSemana({ id: null }), avanceConFaltantes(0));
      let lecturas = 0;
      server.use(
        http.get(`*/api/expedientes/${ID}`, () => {
          lecturas++;
          return HttpResponse.json({ expediente: expedienteEn(lecturas > 1 ? 'FINALIZADO' : 'EN_PROCESO') });
        }),
        http.get('*/api/expedientes/candidatos', () => HttpResponse.json({ candidatos: [] })),
      );
      const cuerpos = capturar('patch', `*/api/expedientes/${ID}/estado`, { expediente: expedienteEn('FINALIZADO') });
      const { user } = renderApp(RUTA);
      const acciones = await esperarDetalle();

      const boton = acciones.getByRole('button', { name: 'Finalizar' });
      await waitFor(() => expect(boton).toBeEnabled());
      expect(acciones.queryByText(/Faltan/)).not.toBeInTheDocument();
      await user.click(boton);
      const form = within(screen.getByRole('form', { name: 'Finalizar expediente' }));
      await user.click(form.getByRole('button', { name: 'Finalizar expediente' }));
      expect(await form.findByText('Indica el motivo.')).toBeInTheDocument();

      await user.type(form.getByLabelText('Motivo'), 'Cumplió la meta');
      await user.click(form.getByRole('button', { name: 'Finalizar expediente' }));
      const dialogo = within(await screen.findByRole('alertdialog'));
      expect(dialogo.getByText(/cierra el expediente/i)).toBeInTheDocument();
      expect(dialogo.getByText(/otra oficina/i)).toBeInTheDocument();
      expect(cuerpos).toHaveLength(0);
      await user.click(dialogo.getByRole('button', { name: 'Sí, continuar' }));

      await waitFor(() => expect(cuerpos).toEqual([{ accion: 'FINALIZAR', motivo: 'Cumplió la meta' }]));
      // The detail is read again after the action, and the case file now has no actions.
      await waitFor(() => expect(lecturas).toBeGreaterThan(1));
      await waitFor(() => expect(screen.queryByRole('group', { name: 'Acciones del expediente' })).not.toBeInTheDocument());
    });

    it('shows the API error when the server says the goal is not reached', async () => {
      mockDetalle('EN_PROCESO', buildSemana({ id: null }), avanceConFaltantes(0));
      server.use(
        http.patch(`*/api/expedientes/${ID}/estado`, () =>
          HttpResponse.json({ error: { code: 'META_NO_ALCANZADA', message: 'Faltan 1 min validadas para la meta.' } }, { status: 409 }),
        ),
      );
      const { user } = renderApp(RUTA);
      const acciones = await esperarDetalle();

      const boton = acciones.getByRole('button', { name: 'Finalizar' });
      await waitFor(() => expect(boton).toBeEnabled());
      await user.click(boton);
      const form = within(screen.getByRole('form', { name: 'Finalizar expediente' }));
      await user.type(form.getByLabelText('Motivo'), 'Cumplió la meta');
      await user.click(form.getByRole('button', { name: 'Finalizar expediente' }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, continuar' }));

      expect(await form.findByRole('alert')).toHaveTextContent('Faltan 1 min validadas para la meta.');
    });

    it('is not offered for a suspended case file (it must be reactivated first)', async () => {
      mockDetalle('SUSPENDIDO', buildSemana({ id: null }), avanceConFaltantes(0));
      renderApp(RUTA);
      const acciones = await esperarDetalle();

      expect(acciones.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    });
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

  it('RN-20: after fixing the email, says the new link went out, or that it failed and Monday retries', async () => {
    mockDetalle('EN_PROCESO');
    let reenvio = { semanas: 1, enviado: true };
    server.use(http.patch(`*/api/supervisores/${supervisor.id}`, () => HttpResponse.json({ supervisor, reenvio })));
    const { user } = renderApp(RUTA);
    await esperarDetalle();

    const guardarCorreo = async (correo: string) => {
      await user.click(screen.getByRole('button', { name: 'Editar supervisor' }));
      const form = within(screen.getByRole('form', { name: 'Editar supervisor' }));
      await user.clear(form.getByLabelText('Correo'));
      await user.type(form.getByLabelText('Correo'), correo);
      await user.click(form.getByRole('button', { name: 'Guardar supervisor' }));
    };

    await guardarCorreo('lucia@hospital.test');
    expect(await screen.findByText('Se envió un enlace nuevo al supervisor con 1 semana pendiente de validar.')).toBeInTheDocument();

    reenvio = { semanas: 3, enviado: false };
    await guardarCorreo('lucia.m@hospital.test');
    expect(await screen.findByText(/No se pudo enviar el enlace nuevo al supervisor \(3 semanas pendientes de validar\)/)).toHaveAttribute('role', 'alert');
  });

  describe('RF-10: editar expediente', () => {
    it('sends only the period, schedule and department, then closes with a confirmation', async () => {
      mockDetalle('EN_PROCESO');
      const cuerpos = capturar('patch', `*/api/expedientes/${ID}`, { expediente: expedienteEn('EN_PROCESO') });
      const { user } = renderApp(RUTA);
      await esperarDetalle();

      await user.click(screen.getByRole('button', { name: 'Editar expediente' }));
      const form = within(screen.getByRole('form', { name: 'Editar expediente' }));
      expect(form.getByLabelText('Fecha de término')).toHaveValue('2026-08-28');
      expect(form.queryByLabelText(/Institución/)).not.toBeInTheDocument();
      await user.clear(form.getByLabelText('Fecha de término'));
      await user.type(form.getByLabelText('Fecha de término'), '2026-12-18');
      await user.click(form.getByLabelText('Martes'));
      await user.click(form.getByRole('button', { name: 'Guardar expediente' }));

      await waitFor(() => expect(cuerpos).toHaveLength(1));
      expect(cuerpos[0]).toEqual({
        departamento: null,
        fechaInicio: '2026-03-02',
        fechaTermino: '2026-12-18',
        diasPactados: [1, 3, 5, 2],
        horaEntrada: '08:00',
        horaSalida: '12:00',
      });
      expect(await screen.findByText('Expediente actualizado.')).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: 'Editar expediente' })).not.toBeInTheDocument();
    });

    it('checks the period before sending and shows API errors', async () => {
      mockDetalle('EN_PROCESO');
      const cuerpos = capturar(
        'patch',
        `*/api/expedientes/${ID}`,
        { error: { code: 'HORARIO_INVALIDO', message: 'La hora de entrada debe ser anterior a la hora de salida.' } },
        400,
      );
      const { user } = renderApp(RUTA);
      await esperarDetalle();

      await user.click(screen.getByRole('button', { name: 'Editar expediente' }));
      const form = within(screen.getByRole('form', { name: 'Editar expediente' }));
      await user.clear(form.getByLabelText('Fecha de término'));
      await user.type(form.getByLabelText('Fecha de término'), '2026-03-01');
      await user.click(form.getByRole('button', { name: 'Guardar expediente' }));
      expect(await form.findByText('La fecha de término debe ser posterior a la de inicio.')).toBeInTheDocument();
      expect(cuerpos).toHaveLength(0);

      await user.clear(form.getByLabelText('Fecha de término'));
      await user.type(form.getByLabelText('Fecha de término'), '2026-12-18');
      await user.click(form.getByRole('button', { name: 'Guardar expediente' }));
      expect(await form.findByRole('alert')).toHaveTextContent('La hora de entrada debe ser anterior a la hora de salida.');
    });

    it('is not offered for a finished case file', async () => {
      mockDetalle('FINALIZADO');
      renderApp(RUTA);
      await screen.findByText('Ana María López García');

      expect(screen.queryByRole('button', { name: 'Editar expediente' })).not.toBeInTheDocument();
    });
  });

  describe('RF-21a: enviar enlace al supervisor ahora', () => {
    it('sends the link and tells the office how many weeks went to which address', async () => {
      mockDetalle('EN_PROCESO');
      const cuerpos = capturar('post', `*/api/expedientes/${ID}/enlace-validacion`, { semanas: 2 });
      const { user } = renderApp(RUTA);
      await esperarDetalle();

      await user.click(screen.getByRole('button', { name: 'Enviar enlace al supervisor' }));

      await waitFor(() => expect(cuerpos).toHaveLength(1));
      expect(await screen.findByText('Se envió el enlace a laura@hospital.test con 2 semanas pendientes de validar.')).toHaveAttribute(
        'role',
        'status',
      );
    });

    it('shows the API error when there is nothing to send', async () => {
      mockDetalle('EN_PROCESO');
      capturar(
        'post',
        `*/api/expedientes/${ID}/enlace-validacion`,
        { error: { code: 'SIN_SEMANAS_POR_VALIDAR', message: 'Este alumno no tiene semanas pendientes de validar.' } },
        409,
      );
      const { user } = renderApp(RUTA);
      await esperarDetalle();

      await user.click(screen.getByRole('button', { name: 'Enviar enlace al supervisor' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Este alumno no tiene semanas pendientes de validar.');
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
