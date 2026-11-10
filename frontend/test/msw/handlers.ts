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

export const carrerasEjemplo = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Contabilidad' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Programación' },
];

// Builds an institution as returned by GET /api/instituciones (staff view, with codigoCorto).
export function buildInstitucion(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Hospital Alfa',
    rfc: 'ABC010101XX1',
    giro: 'Salud',
    calle: 'Av. Juárez',
    numExterior: '123',
    numInterior: null,
    colonia: 'Centro',
    codigoPostal: '67100',
    municipio: 'Guadalupe',
    estado: 'Nuevo León',
    esPlantel: false,
    telefono: '8112345678',
    correo: 'contacto@alfa.mx',
    representante: 'María Pérez',
    horarioAtencion: 'L-V 8:00-15:00',
    turnos: ['MATUTINO'],
    aceptaServicio: true,
    aceptaPracticas: true,
    cupo: 5,
    activa: true,
    carreras: [carrerasEjemplo[1]],
    actualizadoEn: '2026-11-10T12:00:00.000Z',
    codigoCorto: 'ABC234',
    ...overrides,
  };
}

// Default mocked API responses: nobody is signed in. Tests override them with server.use(...).
export const handlers = [
  http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('*/api/me', () => HttpResponse.json(unauthorizedBody, { status: 401 })),
];
