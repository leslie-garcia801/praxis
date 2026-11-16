import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExpedienteActivo, buildMe, unauthorizedBody } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';
import { ULTIMA_SESION_KEY, guardarUltimaSesion, leerUltimaSesion } from './sesionLocal';

const ALUMNO = { id: 'user-1', nombre: 'Ana María López García', rol: 'ALUMNO' } as const;

function ponerSinRed() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
}

function meInalcanzable() {
  server.use(http.get('*/api/me', () => HttpResponse.error()));
}

afterEach(() => vi.restoreAllMocks());

describe('última sesión conocida (RF-16, RNF-07)', () => {
  it('RF-16: tras un /api/me correcto de un alumno guarda solo rol, nombre e id', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ expedienteActivo: buildExpedienteActivo() }))));
    renderApp('/alumno');
    await screen.findByRole('heading', { name: 'Mi avance' });

    const guardado = localStorage.getItem(ULTIMA_SESION_KEY);
    expect(JSON.parse(guardado ?? 'null')).toEqual({ rol: 'ALUMNO', nombre: 'Ana María López García', usuarioId: 'user-1' });
    expect(guardado).not.toContain('25319051769999'); // matrícula
    expect(guardado).not.toContain('Programación');
  });

  it('RF-16: no guarda la sesión de un alumno que debe cambiar su contraseña', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ debeCambiar: true }))));
    renderApp('/cambiar-contrasena');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    expect(leerUltimaSesion()).toBeNull();
  });

  it('RF-03: no guarda la sesión de personal de vinculación', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe({ rol: 'VINCULACION' }))));
    renderApp('/vinculacion');
    await screen.findByRole('button', { name: 'Cerrar sesión' });

    expect(leerUltimaSesion()).toBeNull();
  });

  it('RF-16: se borra cuando /api/me responde 401', async () => {
    guardarUltimaSesion(ALUMNO);
    server.use(http.get('*/api/me', () => HttpResponse.json(unauthorizedBody, { status: 401 })));
    renderApp('/alumno');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(leerUltimaSesion()).toBeNull();
  });

  it('RF-16: se borra al cerrar sesión', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json(buildMe())),
      http.post('*/api/auth/sign-out', () => HttpResponse.json({ success: true })),
    );
    const { user } = renderApp('/alumno');
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(leerUltimaSesion()).toBeNull();
  });

  it('RF-16: ignora un valor guardado que no es un alumno válido', () => {
    localStorage.setItem(ULTIMA_SESION_KEY, JSON.stringify({ rol: 'VINCULACION', nombre: 'X', usuarioId: 'u' }));
    expect(leerUltimaSesion()).toBeNull();
    localStorage.setItem(ULTIMA_SESION_KEY, 'no es json');
    expect(leerUltimaSesion()).toBeNull();
  });
});

describe('abrir la app sin conexión (RF-16)', () => {
  it('RF-16: con una sesión conocida de alumno entra al inicio con "Sin conexión" y el botón Registrar', async () => {
    guardarUltimaSesion(ALUMNO);
    meInalcanzable();
    ponerSinRed();
    const { router } = renderApp('/alumno');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/alumno/registrar');
    expect(screen.getByText('Ana María López García')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-16: también entra si el navegador cree estar en línea pero la petición falla por red', async () => {
    guardarUltimaSesion(ALUMNO);
    meInalcanzable();
    renderApp('/alumno');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('RF-16: desde la raíz y desde /entrar lleva al inicio del alumno', async () => {
    guardarUltimaSesion(ALUMNO);
    meInalcanzable();
    ponerSinRed();
    const { router } = renderApp('/entrar');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RF-16: el historial muestra un estado sin conexión y no un cargando eterno', async () => {
    guardarUltimaSesion(ALUMNO);
    meInalcanzable();
    server.use(http.get('*/api/asistencias', () => HttpResponse.error()));
    ponerSinRed();
    renderApp('/alumno/historial');

    expect(await screen.findByText('Sin conexión. Conéctate para ver tu historial.')).toBeInTheDocument();
    expect(screen.queryByText('Cargando tu historial…')).not.toBeInTheDocument();
  });

  it('RF-16: sin sesión conocida no entra: muestra que no se pudo cargar la sesión', async () => {
    meInalcanzable();
    ponerSinRed();
    renderApp('/alumno');

    expect(await screen.findByText(/No se pudo cargar tu sesión/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mi avance' })).not.toBeInTheDocument();
  });

  it('RN-03b: una sesión conocida de alumno no abre las rutas de vinculación', async () => {
    guardarUltimaSesion(ALUMNO);
    meInalcanzable();
    ponerSinRed();
    const { router } = renderApp('/vinculacion');

    expect(await screen.findByRole('heading', { name: 'Mi avance' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/alumno');
  });

  it('RN-03b: un valor de personal en el almacenamiento nunca abre nada sin conexión', async () => {
    localStorage.setItem(ULTIMA_SESION_KEY, JSON.stringify({ rol: 'ADMIN', nombre: 'Admin', usuarioId: 'u' }));
    meInalcanzable();
    ponerSinRed();
    renderApp('/vinculacion');

    expect(await screen.findByText(/No se pudo cargar tu sesión/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mi avance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });

  it('RF-16: al volver la conexión recupera la sesión real', async () => {
    guardarUltimaSesion(ALUMNO);
    let hayRed = false;
    server.use(
      http.get('*/api/me', () =>
        hayRed ? HttpResponse.json(buildMe({ expedienteActivo: null })) : HttpResponse.error(),
      ),
    );
    const { queryClient } = renderApp('/alumno');
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();

    hayRed = true;
    await queryClient.refetchQueries({ queryKey: ['me'] });

    expect(await screen.findByText(/No tienes un expediente activo/)).toBeInTheDocument();
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
  });
});
