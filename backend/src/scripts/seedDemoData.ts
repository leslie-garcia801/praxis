import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { EstadoValidacion, TipoPrograma, Turno } from '../generated/prisma/enums.js';
import { calcularMinutosAcreditables } from '../domain/horas.js';
import { META_HORAS } from '../domain/programas.js';
import { generarCredencialesQr } from '../domain/qrInstitucion.js';
import { hashPassword } from '../lib/password.js';
import { type FechaISO, fechaLocal, inicioSemana, instanteLocal, sumarDias } from '../lib/tiempo.js';
import { PLANTEL_NOMBRE } from './seedBase.js';

// Demo data for local testing only. Every email uses the reserved example.com domain, so no
// real inbox ever receives a validation link.
export const DEMO_VINCULACION = [
  { email: 'vinculacion.ss@example.com', nombre: 'Vinculación Servicio Social', oficina: 'SERVICIO_SOCIAL' },
  { email: 'vinculacion.pp@example.com', nombre: 'Vinculación Prácticas', oficina: 'PRACTICAS' },
] as const satisfies readonly { email: string; nombre: string; oficina: TipoPrograma }[];

export type InstitucionDemo = { nombre: string; codigoCorto: string; token: string };
export type AlumnoDemo = { matricula: string; nombre: string; conCuenta: boolean; descripcion: string };
export type SeedDemoResult =
  | { creado: false }
  | { creado: true; instituciones: InstitucionDemo[]; alumnos: AlumnoDemo[] };

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

type SemanaPlan = {
  semanasAtras: number;
  estado: EstadoValidacion;
  actividades?: string;
  comentario?: string;
  // Shifts as [weekday offset from Monday, entry "HH:MM", exit "HH:MM"].
  turnos: [number, string, string][];
};

const fechaDb = (fecha: FechaISO) => new Date(`${fecha}T00:00:00.000Z`);

async function crearUsuario(
  tx: Tx,
  datos: { plantelId: string; email: string; nombre: string; rol: 'ALUMNO' | 'VINCULACION'; oficina?: TipoPrograma; matricula?: string },
  passwordHash: string | null,
) {
  const id = randomUUID();
  await tx.user.create({
    data: {
      id,
      name: datos.nombre,
      email: datos.email,
      emailVerified: true,
      username: datos.matricula ?? null,
      displayUsername: datos.matricula ?? null,
      plantelId: datos.plantelId,
      rol: datos.rol,
      oficina: datos.oficina ?? null,
      // Students without an account activate it themselves (RF-02), like an imported student.
      ...(passwordHash && {
        accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: passwordHash } },
      }),
    },
  });
  return id;
}

// Creates the logbook weeks and their shifts. Creditable minutes come from the same RN-04 / RN-09
// rule the scan endpoint uses, so the demo totals match what the app computes.
async function crearSemanas(tx: Tx, expedienteId: string, lunesActual: FechaISO, hoy: FechaISO, plan: SemanaPlan[]) {
  const turnos: { id: string; semanaId: string; entrada: Date; salida: Date; estado: 'CERRADA' }[] = [];

  for (const semana of plan) {
    const lunes = sumarDias(lunesActual, -7 * semana.semanasAtras);
    const domingo = sumarDias(lunes, 6);
    const enviada = semana.estado !== 'BORRADOR';
    const semanaId = randomUUID();
    await tx.semanaBitacora.create({
      data: {
        id: semanaId,
        expedienteId,
        semanaInicio: fechaDb(lunes),
        estado: semana.estado,
        actividades: semana.actividades ?? null,
        comentario: semana.comentario ?? null,
        bitacoraActualizadaEn: semana.actividades ? instanteLocal(domingo, '10:00') : null,
        enviadaEn: enviada ? instanteLocal(sumarDias(domingo, 1), '00:05') : null,
        validadoPor: semana.estado === 'VALIDADA' ? 'supervisor' : null,
        validadoEn: semana.estado === 'VALIDADA' ? instanteLocal(sumarDias(domingo, 2), '09:30') : null,
        rechazadaEn: semana.estado === 'RECHAZADA' ? instanteLocal(sumarDias(domingo, 2), '09:30') : null,
      },
    });

    for (const [dia, entrada, salida] of semana.turnos) {
      const fecha = sumarDias(lunes, dia);
      // Today stays free so the shift can be registered by scanning.
      if (fecha >= hoy) continue;
      turnos.push({
        id: randomUUID(),
        semanaId,
        entrada: instanteLocal(fecha, entrada),
        salida: instanteLocal(fecha, salida),
        estado: 'CERRADA',
      });
    }
  }

  const { porTurno } = calcularMinutosAcreditables(turnos);
  await tx.asistencia.createMany({
    data: turnos.map((t) => ({
      id: t.id,
      salidaId: randomUUID(),
      expedienteId,
      semanaId: t.semanaId,
      entrada: t.entrada,
      salida: t.salida,
      estado: t.estado,
      minutosAcreditables: porTurno[t.id] ?? 0,
      recibidoEn: t.salida,
    })),
  });
}

const semanaCompleta = (entrada: string, salida: string): [number, string, string][] =>
  [0, 1, 2, 3, 4].map((dia) => [dia, entrada, salida]);

/**
 * Demo data on top of seedBase: two vinculación users, three institutions with QR, supervisors and
 * four students covering the main flows. Skips everything when the demo data already exists.
 * `ahora` is injectable so tests can pin the calendar.
 */
export async function seedDemo(
  prisma: PrismaClient,
  { password, ahora = new Date() }: { password: string; ahora?: Date },
): Promise<SeedDemoResult> {
  const plantel = await prisma.plantel.findFirst({ where: { nombre: PLANTEL_NOMBRE } });
  if (!plantel) throw new Error('Run the base seed first (pnpm db:seed): the campus does not exist.');

  const existente = await prisma.user.findUnique({ where: { email: DEMO_VINCULACION[0].email } });
  if (existente) return { creado: false };

  const carreras = new Map((await prisma.carrera.findMany()).map((c) => [c.nombre, c.id]));
  const carrera = (nombre: string) => {
    const id = carreras.get(nombre);
    if (!id) throw new Error(`Career "${nombre}" not found. Run the base seed first.`);
    return id;
  };

  const passwordHash = await hashPassword(password);
  const hoy = fechaLocal(ahora);
  const lunesActual = inicioSemana(hoy);
  const instituciones: InstitucionDemo[] = [];
  const alumnos: AlumnoDemo[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const v of DEMO_VINCULACION) {
        await crearUsuario(tx, { plantelId: plantel.id, email: v.email, nombre: v.nombre, rol: 'VINCULACION', oficina: v.oficina }, passwordHash);
      }

      const crearInstitucion = async (datos: {
        nombre: string;
        rfc: string;
        giro: string;
        calle: string;
        colonia: string;
        municipio: string;
        turnos: Turno[];
        carreras: string[];
        esPlantel?: boolean;
        supervisor: { nombre: string; apellidoPaterno: string; puesto: string; correo: string };
      }) => {
        const { token, qrTokenHash, codigoCorto } = generarCredencialesQr();
        const institucion = await tx.institucion.create({
          data: {
            plantelId: plantel.id,
            nombre: datos.nombre,
            rfc: datos.rfc,
            giro: datos.giro,
            calle: datos.calle,
            colonia: datos.colonia,
            municipio: datos.municipio,
            esPlantel: datos.esPlantel ?? false,
            turnos: datos.turnos,
            cupo: 5,
            qrTokenHash,
            codigoCorto,
            carreras: { create: datos.carreras.map((nombre) => ({ carreraId: carrera(nombre) })) },
          },
        });
        const supervisor = await tx.supervisor.create({
          data: { institucionId: institucion.id, ...datos.supervisor, confirmado: true },
        });
        instituciones.push({ nombre: datos.nombre, codigoCorto, token });
        return { institucionId: institucion.id, supervisorId: supervisor.id };
      };

      const hospital = await crearInstitucion({
        nombre: 'Hospital Metropolitano (demo)',
        rfc: 'HME010101AB1',
        giro: 'Salud',
        calle: 'Av. Constitución 1200',
        colonia: 'Centro',
        municipio: 'Monterrey',
        turnos: ['MATUTINO', 'VESPERTINO'],
        carreras: ['Programación', 'Contabilidad', 'Ciberseguridad'],
        supervisor: { nombre: 'Laura', apellidoPaterno: 'Treviño', puesto: 'Jefa de Sistemas', correo: 'laura.trevino@example.com' },
      });
      const logistica = await crearInstitucion({
        nombre: 'Logística del Norte (demo)',
        rfc: 'LNO020202CD2',
        giro: 'Transporte y almacenaje',
        calle: 'Carretera a Laredo km 12',
        colonia: 'Parque Industrial',
        municipio: 'Escobedo',
        turnos: ['MATUTINO'],
        carreras: ['Logística', 'Mecánica Industrial'],
        supervisor: { nombre: 'Jorge', apellidoPaterno: 'Garza', puesto: 'Gerente de Almacén', correo: 'jorge.garza@example.com' },
      });
      await crearInstitucion({
        nombre: 'CBTIS 258 — Biblioteca (demo)',
        rfc: 'CBT030303EF3',
        giro: 'Educación',
        calle: 'Calle del Plantel 258',
        colonia: 'Valle Verde',
        municipio: 'Monterrey',
        esPlantel: true,
        turnos: ['MATUTINO', 'VESPERTINO'],
        carreras: ['Programación', 'Contabilidad', 'Hospedaje', 'Alimentos y Bebidas'],
        supervisor: { nombre: 'Rosa', apellidoPaterno: 'Salinas', puesto: 'Encargada de Biblioteca', correo: 'rosa.salinas@example.com' },
      });

      const crearAlumno = async (datos: {
        matricula: string;
        nombre: string;
        apellidoPaterno: string;
        apellidoMaterno: string;
        carrera: string;
        semestre: number;
        grupo: string;
        turno: Turno;
        conCuenta: boolean;
        descripcion: string;
      }) => {
        const nombreCompleto = `${datos.nombre} ${datos.apellidoPaterno} ${datos.apellidoMaterno}`;
        const usuarioId = await crearUsuario(
          tx,
          { plantelId: plantel.id, email: `${datos.matricula}@alumno.praxis.invalid`, nombre: nombreCompleto, rol: 'ALUMNO', matricula: datos.matricula },
          datos.conCuenta ? passwordHash : null,
        );
        const alumno = await tx.alumno.create({
          data: {
            usuarioId,
            nombre: datos.nombre,
            apellidoPaterno: datos.apellidoPaterno,
            apellidoMaterno: datos.apellidoMaterno,
            carreraId: carrera(datos.carrera),
            semestre: datos.semestre,
            grupo: datos.grupo,
            turno: datos.turno,
          },
        });
        alumnos.push({ matricula: datos.matricula, nombre: nombreCompleto, conCuenta: datos.conCuenta, descripcion: datos.descripcion });
        return alumno.id;
      };

      // 1. Social service in progress: validated, submitted and draft weeks, plus one long day
      //    that shows the 390-minute daily cap (RN-04).
      const ana = await crearAlumno({
        matricula: '25258000000001',
        nombre: 'Ana',
        apellidoPaterno: 'López',
        apellidoMaterno: 'García',
        carrera: 'Programación',
        semestre: 5,
        grupo: '5A',
        turno: 'MATUTINO',
        conCuenta: true,
        descripcion: 'Servicio social en proceso, semanas validadas, enviada y en borrador',
      });
      const expAna = await tx.expediente.create({
        data: {
          alumnoId: ana,
          tipo: 'SERVICIO_SOCIAL',
          semestre: 5,
          ...hospital,
          departamento: 'Sistemas',
          programa: 'Apoyo en sistemas hospitalarios',
          fechaInicio: fechaDb(sumarDias(lunesActual, -21)),
          diasPactados: [1, 2, 3, 4, 5],
          horaEntrada: '08:00',
          horaSalida: '12:00',
          metaHoras: META_HORAS.SERVICIO_SOCIAL,
          estado: 'EN_PROCESO',
        },
      });
      await crearSemanas(tx, expAna.id, lunesActual, hoy, [
        { semanasAtras: 3, estado: 'VALIDADA', actividades: 'Inventario de equipo de cómputo y etiquetado.', turnos: semanaCompleta('08:00', '12:00') },
        {
          semanasAtras: 2,
          estado: 'VALIDADA',
          actividades: 'Soporte a usuarios y respaldo de expedientes.',
          turnos: [...semanaCompleta('08:00', '12:00').slice(0, 4), [4, '08:00', '15:30']],
        },
        { semanasAtras: 1, estado: 'ENVIADA', actividades: 'Instalación de software en el área de urgencias.', turnos: semanaCompleta('08:00', '12:00') },
        { semanasAtras: 0, estado: 'BORRADOR', turnos: semanaCompleta('08:00', '12:00') },
      ]);

      // 2. Internship with little progress and a rejected week: shows up as at risk (RN-06a).
      const bruno = await crearAlumno({
        matricula: '25258000000002',
        nombre: 'Bruno',
        apellidoPaterno: 'Martínez',
        apellidoMaterno: 'Ruiz',
        carrera: 'Logística',
        semestre: 6,
        grupo: '6B',
        turno: 'VESPERTINO',
        conCuenta: true,
        descripcion: 'Prácticas con poco avance y una semana rechazada (en riesgo)',
      });
      const expBruno = await tx.expediente.create({
        data: {
          alumnoId: bruno,
          tipo: 'PRACTICAS',
          semestre: 6,
          ...logistica,
          departamento: 'Almacén',
          programa: 'Control de inventarios',
          fechaInicio: fechaDb(sumarDias(lunesActual, -42)),
          diasPactados: [1, 3, 5],
          horaEntrada: '08:00',
          horaSalida: '13:00',
          metaHoras: META_HORAS.PRACTICAS,
          estado: 'EN_PROCESO',
        },
      });
      await crearSemanas(tx, expBruno.id, lunesActual, hoy, [
        { semanasAtras: 5, estado: 'VALIDADA', actividades: 'Recepción de mercancía.', turnos: [[0, '08:00', '13:00'], [2, '08:00', '13:00']] },
        {
          semanasAtras: 4,
          estado: 'RECHAZADA',
          actividades: 'Apoyo general.',
          comentario: 'Describe con más detalle las actividades realizadas.',
          turnos: [[0, '08:00', '13:00']],
        },
      ]);

      // 3. Pending case file with an account: must complete institution and supervisor (RF-09).
      const carla = await crearAlumno({
        matricula: '25258000000003',
        nombre: 'Carla',
        apellidoPaterno: 'Hernández',
        apellidoMaterno: 'Soto',
        carrera: 'Contabilidad',
        semestre: 5,
        grupo: '5C',
        turno: 'MATUTINO',
        conCuenta: true,
        descripcion: 'Expediente pendiente: debe completar institución y supervisor',
      });
      await tx.expediente.create({
        data: { alumnoId: carla, tipo: 'SERVICIO_SOCIAL', semestre: 5, metaHoras: META_HORAS.SERVICIO_SOCIAL, estado: 'PENDIENTE' },
      });

      // 4. Imported student without an account: tests activation (RF-02).
      const diego = await crearAlumno({
        matricula: '25258000000004',
        nombre: 'Diego',
        apellidoPaterno: 'Ramírez',
        apellidoMaterno: 'Cruz',
        carrera: 'Programación',
        semestre: 5,
        grupo: '5A',
        turno: 'MATUTINO',
        conCuenta: false,
        descripcion: 'Sin cuenta: sirve para probar la activación',
      });
      await tx.expediente.create({
        data: { alumnoId: diego, tipo: 'SERVICIO_SOCIAL', semestre: 5, metaHoras: META_HORAS.SERVICIO_SOCIAL, estado: 'PENDIENTE' },
      });

      await tx.auditLog.create({
        data: { accion: 'SEED_DEMO', entidad: 'Plantel', entidadId: plantel.id, despues: { instituciones: 3, alumnos: 4 } },
      });
    },
    { timeout: 60_000 },
  );

  return { creado: true, instituciones, alumnos };
}
