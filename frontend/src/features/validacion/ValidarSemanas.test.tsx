import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildEnlaceValidacion, buildSemanaValidacion } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

const TOKEN = 'token-secreto-de-prueba';
const URL_VALIDACION = `*/api/validacion/${TOKEN}`;
const ID_1 = '77777777-7777-4777-8777-777777777771';
const ID_2 = '77777777-7777-4777-8777-777777777772';
const ID_3 = '77777777-7777-4777-8777-777777777773';

type Decision = { semanaId: string; accion: string; comentario?: string };
type Resultado = 'VALIDADA' | 'RECHAZADA' | 'YA_RESUELTA';

// Serves the link and applies POSTed decisions to its in-memory weeks, like the server would.
function mockEnlace(
  semanas: ReturnType<typeof buildSemanaValidacion>[] = [buildSemanaValidacion()],
  { resultados }: { resultados?: Record<string, Resultado> } = {},
) {
  let actuales = semanas;
  const posts: { decisiones: Decision[] }[] = [];
  server.use(
    http.get(URL_VALIDACION, () => HttpResponse.json({ enlace: buildEnlaceValidacion({ semanas: actuales }) })),
    http.post(URL_VALIDACION, async ({ request }) => {
      const body = (await request.json()) as { decisiones: Decision[] };
      posts.push(body);
      const salida = body.decisiones.map((d) => {
        const resultado: Resultado = resultados?.[d.semanaId] ?? (d.accion === 'VALIDAR' ? 'VALIDADA' : 'RECHAZADA');
        if (resultado !== 'YA_RESUELTA') {
          actuales = actuales.map((s) => (s.id === d.semanaId ? { ...s, estado: resultado } : s));
        }
        return { semanaId: d.semanaId, resultado };
      });
      return HttpResponse.json({ resultados: salida });
    }),
  );
  return { posts };
}

const dosAlumnos = () => [
  buildSemanaValidacion({ id: ID_1 }),
  buildSemanaValidacion({ id: ID_2, semanaInicio: '2026-11-09', semanaFin: '2026-11-15' }),
  buildSemanaValidacion({
    id: ID_3,
    semanaInicio: '2026-10-26',
    semanaFin: '2026-11-01',
    alumno: { nombre: 'Luis Pérez Soto', carrera: 'Contabilidad' },
    estado: 'VALIDADA',
  }),
];

function errorGet(status: number, code: string, message: string) {
  server.use(http.get(URL_VALIDACION, () => HttpResponse.json({ error: { code, message } }, { status })));
}

describe('/validar/:token (RF-21, RF-21a, RF-22, RN-06b)', () => {
  it('shows a loading state', async () => {
    server.use(http.get(URL_VALIDACION, () => new Promise(() => {})));
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText('Cargando semanas…')).toBeInTheDocument();
  });

  it('loads and shows greeting, expiry, weeks, shifts and logbook', async () => {
    mockEnlace();
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Hola, Laura Mendoza' })).toBeInTheDocument();
    expect(screen.getByText('Tienes 1 semana pendiente.')).toBeInTheDocument();
    expect(screen.getByText('Este enlace vence el miércoles 25 de noviembre')).toBeInTheDocument();
    expect(screen.getByText('Ana María López García')).toBeInTheDocument();
    expect(screen.getByText(/Programación/)).toBeInTheDocument();
    expect(screen.getByText('Empresa Demo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument();
    expect(screen.getByText('lunes 2 · 08:00 – 14:00 · 5 h')).toBeInTheDocument();
    expect(screen.getByText(/Total acreditado: 5 h/)).toBeInTheDocument();
    const bitacora = screen.getByText(/Apoyé en la captura de expedientes/);
    expect(bitacora.textContent).toContain('\nAtendí al público.');
    expect(bitacora).toHaveClass('whitespace-pre-line');
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('shows "Sin salida registrada" for a shift without exit', async () => {
    mockEnlace([
      buildSemanaValidacion({
        turnos: [
          { entrada: '2026-11-02T14:00:00.000Z', salida: null, estado: 'ABIERTA', minutosAcreditables: null, fueraDeHorario: false },
        ],
      }),
    ]);
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText(/lunes 2 · 08:00 – Sin salida registrada/)).toBeInTheDocument();
  });

  it('RN-06b: muestra la etiqueta de turno fuera del horario pactado', async () => {
    mockEnlace([
      buildSemanaValidacion({
        turnos: [
          { entrada: '2026-11-02T14:00:00.000Z', salida: '2026-11-02T20:00:00.000Z', estado: 'CERRADA', minutosAcreditables: 300, fueraDeHorario: true },
          { entrada: '2026-11-03T14:00:00.000Z', salida: '2026-11-03T20:00:00.000Z', estado: 'CERRADA', minutosAcreditables: 300, fueraDeHorario: false },
        ],
      }),
    ]);
    renderApp(`/validar/${TOKEN}`);
    await screen.findByText('lunes 2 · 08:00 – 14:00 · 5 h');
    expect(screen.getAllByText('Fuera del horario pactado')).toHaveLength(1);
  });

  it('validating one week sends the right body and shows it as "Validada"', async () => {
    const { posts } = mockEnlace(dosAlumnos());
    const { user } = renderApp(`/validar/${TOKEN}`);
    const tarjeta = (await screen.findByRole('heading', { name: 'Semana del 2 al 8 de noviembre' })).closest('article')!;
    await user.click(within(tarjeta).getByRole('button', { name: 'Validar' }));
    expect(await within(tarjeta).findByText('Validada')).toBeInTheDocument();
    expect(posts).toEqual([{ decisiones: [{ semanaId: ID_1, accion: 'VALIDAR' }] }]);
    expect(within(tarjeta).queryByRole('button', { name: 'Validar' })).not.toBeInTheDocument();
  });

  it('RF-22: rechazar exige un comentario de al menos 5 caracteres', async () => {
    const { posts } = mockEnlace([buildSemanaValidacion()]);
    const { user } = renderApp(`/validar/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const campo = screen.getByRole('textbox', { name: 'Motivo del rechazo' });
    await user.type(campo, 'mal');
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByText('Escribe al menos 5 caracteres.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.clear(campo);
    await user.type(campo, 'Faltan actividades');
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByText('Rechazada')).toBeInTheDocument();
    expect(posts).toEqual([{ decisiones: [{ semanaId: ID_1, accion: 'RECHAZAR', comentario: 'Faltan actividades' }] }]);
  });

  it('validar todo sends one request with every ENVIADA week after confirming', async () => {
    const { posts } = mockEnlace(dosAlumnos());
    const { user } = renderApp(`/validar/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Validar todo' }));
    const dialogo = screen.getByRole('alertdialog');
    expect(within(dialogo).getByText('Vas a validar 2 semanas')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    await user.click(within(dialogo).getByRole('button', { name: 'Sí, validar' }));
    expect(await screen.findByText('Listo, no tienes semanas pendientes. Gracias.')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.decisiones).toEqual([
      { semanaId: ID_1, accion: 'VALIDAR' },
      { semanaId: ID_2, accion: 'VALIDAR' },
    ]);
  });

  it('shows a message when the week was already resolved (YA_RESUELTA)', async () => {
    mockEnlace([buildSemanaValidacion()], { resultados: { [ID_1]: 'YA_RESUELTA' } });
    const { user } = renderApp(`/validar/${TOKEN}`);
    await user.click(await screen.findByRole('button', { name: 'Validar' }));
    expect(await screen.findByText('Esta semana ya se había resuelto')).toBeInTheDocument();
  });

  it('shows "no pending weeks" when nothing is ENVIADA', async () => {
    mockEnlace([buildSemanaValidacion({ estado: 'VALIDADA' })]);
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText('Listo, no tienes semanas pendientes. Gracias.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Validar todo' })).not.toBeInTheDocument();
  });

  it('shows the invalid link screen on 404', async () => {
    errorGet(404, 'ENLACE_NO_VALIDO', 'x');
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText('Este enlace no es válido.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the expired link screen on 410', async () => {
    errorGet(410, 'ENLACE_VENCIDO', 'x');
    renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText('Este enlace venció. Usa el del correo más reciente.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the API message with a retry button on other errors', async () => {
    errorGet(500, 'INTERNAL', 'Algo salió mal.');
    const { user } = renderApp(`/validar/${TOKEN}`);
    expect(await screen.findByText('Algo salió mal.')).toBeInTheDocument();
    mockEnlace();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Hola, Laura Mendoza' })).toBeInTheDocument();
  });

  it('works without a session: never calls /api/me', async () => {
    mockEnlace();
    let llamadasMe = 0;
    server.use(
      http.get('*/api/me', () => {
        llamadasMe += 1;
        return HttpResponse.json({ error: { code: 'NO_AUTENTICADO', message: 'x' } }, { status: 401 });
      }),
    );
    renderApp(`/validar/${TOKEN}`);
    await screen.findByRole('heading', { name: 'Hola, Laura Mendoza' });
    expect(llamadasMe).toBe(0);
  });
});
