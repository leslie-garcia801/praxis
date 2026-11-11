import { http, HttpResponse } from 'msw';

type Rol = 'ALUMNO' | 'VINCULACION' | 'ADMIN';

// Builds a GET /api/me body (backend/src/modules/me/me.service.ts).
export function buildMe({
  rol = 'ALUMNO',
  debeCambiar = false,
  expedienteActivo = null,
}: { rol?: Rol; debeCambiar?: boolean; expedienteActivo?: Record<string, unknown> | null } = {}) {
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
    alumno:
      rol === 'ALUMNO'
        ? {
            nombre: 'Ana María',
            apellidoPaterno: 'López',
            apellidoMaterno: 'García',
            carrera: 'Programación',
            semestre: 5,
            grupo: 'A',
            turno: 'MATUTINO',
          }
        : null,
    expedienteActivo,
  };
}

// Builds the expedienteActivo of GET /api/me.
export function buildExpedienteActivo(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    tipo: 'SERVICIO_SOCIAL',
    estado: 'EN_PROCESO',
    metaHoras: 480,
    fechaInicio: '2026-09-01',
    fechaTermino: null,
    institucion: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Hospital Alfa' },
    ...overrides,
  };
}

// Builds the `avance` of GET /api/expedientes/:id/avance (tarea 0015).
export function buildAvance(overrides: Record<string, unknown> = {}) {
  return {
    expedienteId: '44444444-4444-4444-8444-444444444444',
    metaMinutos: 28800,
    minutosValidados: 750,
    minutosRegistrados: 900,
    minutosFaltantes: 28050,
    porcentaje: 2,
    fechaEstimada: { tipo: 'ESTIMADA', fecha: '2026-11-16', promedioMinutosDia: 240 },
    turnoAbierto: null,
    ...overrides,
  };
}

// Builds the `semana` of GET /api/asistencias (tarea 0015): 7 empty days from `inicio` (a Monday).
// `turnosPorDia` maps a date to its shifts; day totals can be overridden per date in `totalesDia`.
export function buildSemana({
  inicio = '2026-11-09',
  estadoValidacion = null,
  turnosPorDia = {},
  totalesDia = {},
  totales,
}: {
  inicio?: string;
  estadoValidacion?: string | null;
  turnosPorDia?: Record<string, Record<string, unknown>[]>;
  totalesDia?: Record<string, { minutosDia: number; minutosAcreditablesDia: number }>;
  totales?: { minutos: number; minutosAcreditables: number };
} = {}) {
  const start = new Date(`${inicio}T12:00:00Z`);
  const fechas = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const dias = fechas.map((fecha) => {
    const turnos = (turnosPorDia[fecha] ?? []).map((t, i) => ({
      id: `turno-${fecha}-${i}`,
      entrada: `${fecha}T16:00:00.000Z`,
      salida: `${fecha}T20:00:00.000Z`,
      estado: 'CERRADA',
      minutosAcreditables: 240,
      sinConexion: false,
      ...t,
    }));
    const suma = turnos.reduce((acc, t) => acc + (typeof t.minutosAcreditables === 'number' ? t.minutosAcreditables : 0), 0);
    return { fecha, turnos, minutosDia: suma, minutosAcreditablesDia: suma, ...totalesDia[fecha] };
  });
  return {
    inicio,
    fin: fechas[6],
    estadoValidacion,
    dias,
    totales: totales ?? {
      minutos: dias.reduce((a, d) => a + d.minutosDia, 0),
      minutosAcreditables: dias.reduce((a, d) => a + d.minutosAcreditablesDia, 0),
    },
  };
}

// Builds a supervisor as the student sees it (GET /api/instituciones/:id/supervisores, task 0012).
export function buildSupervisor(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    institucionId: '33333333-3333-4333-8333-333333333333',
    titulo: 'Lic.',
    nombre: 'Laura',
    apellidoPaterno: 'Mendoza',
    apellidoMaterno: 'Ruiz',
    puesto: 'Gerente',
    departamento: 'Sistemas',
    confirmado: true,
    ...overrides,
  };
}

// Builds the `expediente` of GET/PATCH /api/expedientes/:id (task 0012). Defaults to a fresh PENDIENTE servicio social file.
export function buildExpediente(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    tipo: 'SERVICIO_SOCIAL',
    estado: 'PENDIENTE',
    semestre: 5,
    metaHoras: 480,
    minutosTransferidos: 0,
    departamento: null,
    fechaInicio: null,
    fechaTermino: null,
    diasPactados: [],
    horaEntrada: null,
    horaSalida: null,
    programa: null,
    subprograma: null,
    creadoEn: '2026-11-01T12:00:00.000Z',
    institucion: null,
    supervisor: null,
    faltantes: ['institucionId', 'supervisorId', 'fechaInicio'],
    ...overrides,
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
