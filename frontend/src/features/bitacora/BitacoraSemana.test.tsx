import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExpedienteActivo, buildMe, buildSemana } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const HISTORIAL_URL = '*/api/asistencias';
const SEMANA_ID = '66666666-6666-4666-8666-666666666666';
const TEXTO_VALIDO = 'Apoyé en la captura de expedientes y en la atención al público durante toda la semana.';
// Closed week (Wednesday 2026-11-11 is the "today" of these tests).
const SEMANA_CERRADA = '2026-11-02';

type Llamada = { metodo: string; url: string; body: unknown };

function mockAlumno() {
  server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))));
}

// Serves the week and records every PUT/POST. The week the API returns reflects what was saved or sent.
function mockBitacora(
  semana: Parameters<typeof buildSemana>[0] = {},
  { putError, postError }: { putError?: { status: number; code: string; message: string }; postError?: { status: number; code: string; message: string } } = {},
) {
  const llamadas: Llamada[] = [];
  let actual = { inicio: SEMANA_CERRADA, ...semana };
  server.use(
    http.get(HISTORIAL_URL, () => HttpResponse.json({ semana: buildSemana(actual) })),
    http.put(`*/api/semanas/${SEMANA_ID}/bitacora`, async ({ request }) => {
      const body = (await request.json()) as { actividades: string };
      llamadas.push({ metodo: 'PUT', url: new URL(request.url).pathname, body });
      if (putError) return HttpResponse.json({ error: putError }, { status: putError.status });
      actual = { ...actual, actividades: body.actividades };
      return HttpResponse.json({ semana: { id: SEMANA_ID, semanaInicio: actual.inicio, estado: 'BORRADOR', actividades: body.actividades } });
    }),
    http.post(`*/api/semanas/${SEMANA_ID}/enviar`, ({ request }) => {
      llamadas.push({ metodo: 'POST', url: new URL(request.url).pathname, body: null });
      if (postError) return HttpResponse.json({ error: postError }, { status: postError.status });
      actual = { ...actual, estadoValidacion: 'ENVIADA', puedeEditar: false, puedeEnviar: false, enviadaEn: '2026-11-11T18:00:00.000Z' };
      return HttpResponse.json({ semana: { id: SEMANA_ID, semanaInicio: actual.inicio, estado: 'ENVIADA' } });
    }),
  );
  return llamadas;
}

const area = () => screen.findByRole('textbox', { name: 'Actividades de la semana' });

describe('bitácora en /alumno/historial (RF-20, RF-22, RN-17)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T18:00:00Z')); // Wednesday 12:00 in Monterrey
    mockAlumno();
  });
  afterEach(() => vi.useRealTimers());

  it('without turns the logbook is not enabled yet', async () => {
    mockBitacora({ id: null });
    renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    expect(await screen.findByText('La bitácora se habilita con tu primer registro de la semana')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('RF-20: guarda el borrador con el texto escrito', async () => {
    const llamadas = mockBitacora({ puedeEditar: true, estadoValidacion: 'BORRADOR' });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    await user.type(await area(), 'Archivo y atención.');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(llamadas).toEqual([{ metodo: 'PUT', url: `/api/semanas/${SEMANA_ID}/bitacora`, body: { actividades: 'Archivo y atención.' } }]);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows the saved text and limits it to 5000 characters', async () => {
    mockBitacora({ puedeEditar: true, actividades: 'Texto previo' });
    renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    const texto = await area();
    expect(texto).toHaveValue('Texto previo');
    expect(texto).toHaveAttribute('maxlength', '5000');
  });

  it('RN-17: el contador cuenta los caracteres sin espacios al inicio y al final', async () => {
    mockBitacora({ puedeEditar: true });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    expect(await screen.findByText('0 de 50 caracteres mínimos')).toBeInTheDocument();

    await user.type(await area(), '   abc   ');

    expect(screen.getByText('3 de 50 caracteres mínimos')).toBeInTheDocument();
  });

  it('RN-17: no permite enviar con menos de 50 caracteres', async () => {
    mockBitacora({ puedeEditar: true, puedeEnviar: true, actividades: 'a'.repeat(49) });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    const enviar = await screen.findByRole('button', { name: 'Enviar a mi supervisor' });
    expect(enviar).toBeDisabled();
    expect(screen.getByText('Escribe al menos 50 caracteres para poder enviar la bitácora')).toBeInTheDocument();

    await user.type(await area(), 'a');
    expect(enviar).toBeEnabled();
    expect(screen.queryByText('Escribe al menos 50 caracteres para poder enviar la bitácora')).not.toBeInTheDocument();
  });

  it('RN-17: los espacios de los extremos no cuentan para habilitar el envío', async () => {
    mockBitacora({ puedeEditar: true, puedeEnviar: true, actividades: `   ${'a'.repeat(49)}   ` });
    renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    expect(await screen.findByRole('button', { name: 'Enviar a mi supervisor' })).toBeDisabled();
  });

  it('RF-20: enviar con cambios sin guardar guarda primero (PUT) y luego envía (POST)', async () => {
    const llamadas = mockBitacora({ puedeEditar: true, puedeEnviar: true, actividades: 'x'.repeat(10) });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    const texto = await area();
    await user.clear(texto);
    await user.type(texto, TEXTO_VALIDO);
    await user.click(screen.getByRole('button', { name: 'Enviar a mi supervisor' }));

    expect(await screen.findByText('Enviada a tu supervisor el miércoles 11 de noviembre')).toBeInTheDocument();
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual([
      `PUT /api/semanas/${SEMANA_ID}/bitacora`,
      `POST /api/semanas/${SEMANA_ID}/enviar`,
    ]);
    expect(llamadas[0]?.body).toEqual({ actividades: TEXTO_VALIDO });
  });

  it('RF-20: enviar sin cambios solo hace POST', async () => {
    const llamadas = mockBitacora({ puedeEditar: true, puedeEnviar: true, actividades: TEXTO_VALIDO });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    await user.click(await screen.findByRole('button', { name: 'Enviar a mi supervisor' }));

    await screen.findByText(/Enviada a tu supervisor el/);
    expect(llamadas.map((l) => l.metodo)).toEqual(['POST']);
  });

  it('RF-22: muestra el comentario de una semana rechazada y permite corregirla', async () => {
    const llamadas = mockBitacora({
      estadoValidacion: 'RECHAZADA',
      comentario: 'Detalla las actividades.',
      puedeEditar: true,
      puedeEnviar: true,
      actividades: 'Texto insuficiente que debe corregirse pronto.',
    });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Tu supervisor la rechazó: «Detalla las actividades.». Corrígela y vuelve a enviarla');

    await user.type(await area(), ' Más detalle.');
    await user.click(screen.getByRole('button', { name: 'Enviar a mi supervisor' }));

    await screen.findByText(/Enviada a tu supervisor el/);
    expect(llamadas.map((l) => l.metodo)).toEqual(['PUT', 'POST']);
    expect(llamadas[0]?.body).toEqual({ actividades: 'Texto insuficiente que debe corregirse pronto. Más detalle.' });
  });

  it('a sent week is read-only and shows when it was sent', async () => {
    mockBitacora({
      estadoValidacion: 'ENVIADA',
      actividades: TEXTO_VALIDO,
      enviadaEn: '2026-11-16T14:00:00.000Z',
    });
    renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    expect(await screen.findByText('Enviada a tu supervisor el lunes 16 de noviembre')).toBeInTheDocument();
    expect(screen.getByText(TEXTO_VALIDO)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar a mi supervisor' })).not.toBeInTheDocument();
  });

  it('a validated week is read-only', async () => {
    mockBitacora({ estadoValidacion: 'VALIDADA', actividades: TEXTO_VALIDO });
    renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    expect(await screen.findByText('Validada por tu supervisor')).toBeInTheDocument();
    expect(screen.getByText(TEXTO_VALIDO)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('RN-17: la semana en curso avisa que se envía sola el lunes y no ofrece enviar', async () => {
    mockBitacora({ inicio: '2026-11-09', puedeEditar: true, puedeEnviar: false, actividades: TEXTO_VALIDO });
    renderApp('/alumno/historial');
    expect(
      await screen.findByText(
        'Podrás enviarla a partir del lunes. Si la dejas lista (50 caracteres o más), se envía sola el lunes a tu supervisor',
      ),
    ).toBeInTheDocument();
    expect(await area()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar a mi supervisor' })).not.toBeInTheDocument();
  });

  it('shows the API message when saving fails and does not send', async () => {
    const llamadas = mockBitacora(
      { puedeEditar: true, puedeEnviar: true, actividades: 'x'.repeat(10) },
      { putError: { status: 409, code: 'SEMANA_NO_EDITABLE', message: 'La bitácora de esta semana ya no se puede editar.' } },
    );
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);

    const texto = await area();
    await user.clear(texto);
    await user.type(texto, TEXTO_VALIDO);
    await user.click(screen.getByRole('button', { name: 'Enviar a mi supervisor' }));

    expect(await screen.findByText('La bitácora de esta semana ya no se puede editar.')).toBeInTheDocument();
    expect(llamadas.map((l) => l.metodo)).toEqual(['PUT']);
    expect(texto).toHaveValue(TEXTO_VALIDO);
  });

  it.each([
    ['SEMANA_EN_CURSO', 'La semana todavía no termina. Podrás enviarla a partir del lunes.'],
    ['BITACORA_INCOMPLETA', 'Escribe al menos 50 caracteres en la bitácora antes de enviarla.'],
    ['EXPEDIENTE_NO_ACTIVO', 'Tu expediente no está en proceso, por lo que no puedes enviar la semana.'],
  ])('shows the API message of %s when sending fails', async (code, message) => {
    mockBitacora({ puedeEditar: true, puedeEnviar: true, actividades: TEXTO_VALIDO }, { postError: { status: 409, code, message } });
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    await user.click(await screen.findByRole('button', { name: 'Enviar a mi supervisor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows a generic message when the request cannot be made', async () => {
    mockBitacora({ puedeEditar: true, actividades: 'x' });
    server.use(http.put(`*/api/semanas/${SEMANA_ID}/bitacora`, () => HttpResponse.error()));
    const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
    await user.type(await area(), 'y');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  });

  describe('cambios sin guardar', () => {
    it('asks before leaving the week and keeps what was typed when the student stays', async () => {
      mockBitacora({ puedeEditar: true });
      const { user, router } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
      await user.type(await area(), 'Borrador');

      await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

      const aviso = await screen.findByRole('alertdialog');
      expect(within(aviso).getByText('Tienes cambios sin guardar. Si sales, se perderán.')).toBeInTheDocument();
      await user.click(within(aviso).getByRole('button', { name: 'Seguir editando' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(router.state.location.search).toBe(`?semana=${SEMANA_CERRADA}`);
      expect(await area()).toHaveValue('Borrador');
    });

    it('leaves the week when the student confirms', async () => {
      mockBitacora({ puedeEditar: true });
      const { user, router } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
      await user.type(await area(), 'Borrador');

      await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
      await user.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));

      await waitFor(() => expect(router.state.location.search).toBe('?semana=2026-10-26'));
    });

    it('does not ask when there is nothing to save', async () => {
      mockBitacora({ puedeEditar: true, actividades: 'Guardado' });
      const { user, router } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
      await area();

      await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

      await waitFor(() => expect(router.state.location.search).toBe('?semana=2026-10-26'));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('warns the browser before closing the tab with unsaved changes', async () => {
      mockBitacora({ puedeEditar: true });
      const { user } = renderApp(`/alumno/historial?semana=${SEMANA_CERRADA}`);
      const sinCambios = new Event('beforeunload', { cancelable: true });
      await area();
      window.dispatchEvent(sinCambios);
      expect(sinCambios.defaultPrevented).toBe(false);

      await user.type(await area(), 'Borrador');
      const conCambios = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(conCambios);
      expect(conCambios.defaultPrevented).toBe(true);
    });
  });
});
