import { randomUUID } from 'node:crypto';
import { generarCredencialesQr } from '../../domain/qrInstitucion.js';
import { normalizarNombre } from '../../domain/nombres.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { CrearInstitucionInput, EditarInstitucionInput, ListarInstitucionesQuery } from './instituciones.schemas.js';

const MAX_INTENTOS_QR = 5;

const rfcDuplicado = () => new AppError(409, 'RFC_DUPLICADO', 'Ya existe una institución con ese RFC en tu plantel.');
const carrerasInvalidas = () => new AppError(400, 'CARRERAS_INVALIDAS', 'Alguna de las carreras indicadas no existe.');

const conCarreras = { carreras: { select: { carrera: { select: { id: true, nombre: true } } } } } satisfies Prisma.InstitucionInclude;
type InstitucionConCarreras = Prisma.InstitucionGetPayload<{ include: typeof conCarreras }>;

// qrTokenHash is never part of a response (RNF-06). codigoCorto is only for vinculación (RF-15):
// a student who knows it could register without being at the institution.
function aRespuesta(i: InstitucionConCarreras, user: AuthUser) {
  type Respuesta = typeof base & { codigoCorto?: string };
  const base = {
    id: i.id,
    nombre: i.nombre,
    rfc: i.rfc,
    giro: i.giro,
    calle: i.calle,
    numExterior: i.numExterior,
    numInterior: i.numInterior,
    colonia: i.colonia,
    codigoPostal: i.codigoPostal,
    municipio: i.municipio,
    estado: i.estado,
    esPlantel: i.esPlantel,
    telefono: i.telefono,
    correo: i.correo,
    representante: i.representante,
    horarioAtencion: i.horarioAtencion,
    turnos: i.turnos,
    aceptaServicio: i.aceptaServicio,
    aceptaPracticas: i.aceptaPracticas,
    cupo: i.cupo,
    activa: i.activa,
    carreras: i.carreras.map((c) => c.carrera).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    actualizadoEn: i.actualizadoEn,
  };
  const respuesta: Respuesta = user.rol === 'ALUMNO' ? base : { ...base, codigoCorto: i.codigoCorto };
  return respuesta;
}

// Audit snapshot (RF-29): editable columns plus the carrera ids; never the QR hash.
const CAMPOS_EDITABLES = [
  'nombre', 'rfc', 'giro', 'calle', 'numExterior', 'numInterior', 'colonia', 'codigoPostal', 'municipio', 'estado',
  'esPlantel', 'telefono', 'correo', 'representante', 'horarioAtencion', 'turnos', 'aceptaServicio', 'aceptaPracticas',
  'cupo', 'activa',
] as const;

function instantanea(i: InstitucionConCarreras) {
  const datos: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITABLES) datos[campo] = i[campo];
  datos.carreraIds = i.carreras.map((c) => c.carrera.id).sort();
  return datos;
}

async function verificarCarreras(carreraIds: string[]) {
  if (carreraIds.length === 0) return;
  if ((await prisma.carrera.count({ where: { id: { in: carreraIds } } })) !== carreraIds.length) throw carrerasInvalidas();
}

const esViolacionUnica = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// RF-08: creates the institution with a fresh QR token (only its hash is stored, RNF-06) and a short code (RF-15).
// `generar` is injectable so the collision retry can be tested.
export async function crearInstitucion(user: AuthUser, input: CrearInstitucionInput, generar = generarCredencialesQr) {
  const { carreraIds, ...datos } = input;
  await verificarCarreras(carreraIds);
  if (datos.rfc && (await prisma.institucion.findUnique({ where: { plantelId_rfc: { plantelId: user.plantelId, rfc: datos.rfc } }, select: { id: true } }))) {
    throw rfcDuplicado();
  }

  for (let intento = 1; ; intento++) {
    const { qrTokenHash, codigoCorto } = generar();
    const id = randomUUID();
    try {
      const [creada] = await prisma.$transaction([
        prisma.institucion.create({
          data: { id, plantelId: user.plantelId, ...datos, qrTokenHash, codigoCorto, carreras: { create: carreraIds.map((carreraId) => ({ carreraId })) } },
          include: conCarreras,
        }),
        prisma.auditLog.create({
          data: {
            usuarioId: user.id,
            accion: 'CREAR_INSTITUCION',
            entidad: 'Institucion',
            entidadId: id,
            despues: { ...datos, carreraIds: [...carreraIds].sort(), plantelId: user.plantelId },
          },
        }),
      ]);
      return aRespuesta(creada, user);
    } catch (err) {
      if (!esViolacionUnica(err)) throw err;
      // Same RFC created in parallel, or a QR/short-code collision: only the latter is retried.
      if (datos.rfc && (await prisma.institucion.findUnique({ where: { plantelId_rfc: { plantelId: user.plantelId, rfc: datos.rfc } }, select: { id: true } }))) {
        throw rfcDuplicado();
      }
      if (intento >= MAX_INTENTOS_QR) throw err;
    }
  }
}

// RF-05: a student only sees active institutions; anything outside the plantel does not exist.
async function buscarVisible(user: AuthUser, id: string) {
  const institucion = await prisma.institucion.findFirst({
    where: { id, plantelId: user.plantelId, ...(user.rol === 'ALUMNO' && { activa: true }) },
    include: conCarreras,
  });
  if (!institucion) throw AppError.notFound('La institución no existe.');
  return institucion;
}

export async function obtenerInstitucion(user: AuthUser, id: string) {
  return aRespuesta(await buscarVisible(user, id), user);
}

// RF-06: catalog filters. Text filters ignore case and accents (done in memory: a campus has ~300 rows).
// conCupo keeps only cupo > 0; unknown cupo (null) is excluded on purpose.
export async function listarInstituciones(user: AuthUser, filtros: ListarInstitucionesQuery) {
  const { q, municipio, colonia, carrera, turno, tipo, conCupo } = filtros;
  const filas = await prisma.institucion.findMany({
    where: {
      plantelId: user.plantelId,
      ...(user.rol === 'ALUMNO' && { activa: true }),
      ...(carrera && { carreras: { some: { carreraId: carrera } } }),
      ...(turno && { turnos: { has: turno } }),
      ...(tipo === 'PRACTICAS' && { aceptaPracticas: true }),
      ...((tipo === 'SERVICIO' || tipo === 'SERVICIO_SOCIAL') && { aceptaServicio: true }),
      ...(conCupo && { cupo: { gt: 0 } }),
    },
    include: conCarreras,
  });

  const buscado = q ? normalizarNombre(q) : '';
  const igual = (valor: string | null, esperado: string | undefined) =>
    !esperado || (valor !== null && normalizarNombre(valor) === normalizarNombre(esperado));

  return filas
    .filter((i) => !buscado || normalizarNombre(i.nombre).includes(buscado) || normalizarNombre(i.giro ?? '').includes(buscado))
    .filter((i) => igual(i.municipio, municipio) && igual(i.colonia, colonia))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((i) => aRespuesta(i, user));
}

// RF-08: partial edit (including activa, cupo and carreras). RF-29: audits previous and new values of what changed.
export async function editarInstitucion(user: AuthUser, id: string, input: EditarInstitucionInput) {
  if (input.carreraIds) await verificarCarreras(input.carreraIds);

  try {
    const actualizada = await prisma.$transaction(async (tx) => {
      const actual = await tx.institucion.findFirst({ where: { id, plantelId: user.plantelId }, include: conCarreras });
      if (!actual) throw AppError.notFound('La institución no existe.');

      const antes = instantanea(actual);
      const { carreraIds, ...columnas } = input;
      if (carreraIds) {
        await tx.institucionCarrera.deleteMany({ where: { institucionId: id } });
        await tx.institucionCarrera.createMany({ data: carreraIds.map((carreraId) => ({ institucionId: id, carreraId })) });
      }
      if (Object.keys(columnas).length > 0) await tx.institucion.update({ where: { id }, data: columnas });

      const nueva = await tx.institucion.findUniqueOrThrow({ where: { id }, include: conCarreras });
      const despues = instantanea(nueva);
      const cambios = Object.keys(despues).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
      if (cambios.length > 0) {
        await tx.auditLog.create({
          data: {
            usuarioId: user.id,
            accion: 'EDITAR_INSTITUCION',
            entidad: 'Institucion',
            entidadId: id,
            antes: Object.fromEntries(cambios.map((k) => [k, antes[k]])) as Prisma.InputJsonObject,
            despues: Object.fromEntries(cambios.map((k) => [k, despues[k]])) as Prisma.InputJsonObject,
          },
        });
      }
      return nueva;
    });
    return aRespuesta(actualizada, user);
  } catch (err) {
    // The RFC is the only unique column an edit can change.
    if (esViolacionUnica(err)) throw rfcDuplicado();
    throw err;
  }
}
