import { http, HttpResponse } from 'msw';

type Rol = 'ALUMNO' | 'VINCULACION' | 'ADMIN';

// Builds a GET /api/me body (backend/src/modules/me/me.service.ts).
export function buildMe({ rol = 'ALUMNO', debeCambiar = false }: { rol?: Rol; debeCambiar?: boolean } = {}) {
  return {
    usuario: {
      id: 'user-1',
      nombre: 'Ana María López García',
      email: null,
      matricula: rol === 'ALUMNO' ? '25319051769999' : null,
      rol,
      oficina: rol === 'VINCULACION' ? 'SERVICIO_SOCIAL' : null,
      debeCambiar,
    },
    alumno: null,
    expedienteActivo: null,
  };
}

export const unauthorizedBody = {
  error: { code: 'NO_AUTENTICADO', message: 'Debes iniciar sesión.' },
};

// Default mocked API responses: nobody is signed in. Tests override them with server.use(...).
export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('*/api/me', () => HttpResponse.json(unauthorizedBody, { status: 401 })),
];
