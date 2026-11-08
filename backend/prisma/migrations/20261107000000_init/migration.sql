-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ALUMNO', 'VINCULACION', 'ADMIN');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MATUTINO', 'VESPERTINO');

-- CreateEnum
CREATE TYPE "TipoPrograma" AS ENUM ('SERVICIO_SOCIAL', 'PRACTICAS');

-- CreateEnum
CREATE TYPE "EstadoExpediente" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('ABIERTA', 'CERRADA', 'INCOMPLETA');

-- CreateEnum
CREATE TYPE "EstadoValidacion" AS ENUM ('BORRADOR', 'ENVIADA', 'VALIDADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "Plantel" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Plantel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "plantelId" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'ALUMNO',
    "oficina" "TipoPrograma",
    "debeCambiar" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alumno" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "carreraId" TEXT NOT NULL,
    "semestre" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "turno" "Turno" NOT NULL,

    CONSTRAINT "Alumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institucion" (
    "id" TEXT NOT NULL,
    "plantelId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rfc" TEXT,
    "giro" TEXT,
    "calle" TEXT NOT NULL,
    "numExterior" TEXT,
    "numInterior" TEXT,
    "colonia" TEXT,
    "codigoPostal" TEXT,
    "municipio" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Nuevo León',
    "esPlantel" BOOLEAN NOT NULL DEFAULT false,
    "telefono" TEXT,
    "correo" TEXT,
    "representante" TEXT,
    "horarioAtencion" TEXT,
    "turnos" "Turno"[],
    "aceptaServicio" BOOLEAN NOT NULL DEFAULT true,
    "aceptaPracticas" BOOLEAN NOT NULL DEFAULT true,
    "cupo" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "qrTokenHash" TEXT NOT NULL,
    "codigoCorto" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Institucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitucionCarrera" (
    "institucionId" TEXT NOT NULL,
    "carreraId" TEXT NOT NULL,

    CONSTRAINT "InstitucionCarrera_pkey" PRIMARY KEY ("institucionId","carreraId")
);

-- CreateTable
CREATE TABLE "Supervisor" (
    "id" TEXT NOT NULL,
    "institucionId" TEXT NOT NULL,
    "titulo" TEXT,
    "nombre" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "puesto" TEXT,
    "departamento" TEXT,
    "correo" TEXT NOT NULL,
    "telefono" TEXT,
    "extension" TEXT,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Supervisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expediente" (
    "id" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "tipo" "TipoPrograma" NOT NULL,
    "semestre" INTEGER NOT NULL,
    "institucionId" TEXT,
    "supervisorId" TEXT,
    "departamento" TEXT,
    "fechaInicio" DATE,
    "fechaTermino" DATE,
    "diasPactados" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "horaEntrada" TEXT,
    "horaSalida" TEXT,
    "programa" TEXT,
    "subprograma" TEXT,
    "metaHoras" INTEGER NOT NULL,
    "minutosTransferidos" INTEGER NOT NULL DEFAULT 0,
    "motivoTransferencia" TEXT,
    "estado" "EstadoExpediente" NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asistencia" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "entrada" TIMESTAMPTZ NOT NULL,
    "salida" TIMESTAMPTZ,
    "minutosAcreditables" INTEGER,
    "estado" "EstadoAsistencia" NOT NULL DEFAULT 'ABIERTA',
    "sinConexion" BOOLEAN NOT NULL DEFAULT false,
    "recibidoEn" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "semanaId" TEXT,

    CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanaBitacora" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "semanaInicio" DATE NOT NULL,
    "actividades" TEXT,
    "estado" "EstadoValidacion" NOT NULL DEFAULT 'BORRADOR',
    "tokenHash" TEXT,
    "tokenExpira" TIMESTAMPTZ,
    "validadoPor" TEXT,
    "validadoEn" TIMESTAMPTZ,
    "comentario" TEXT,

    CONSTRAINT "SemanaBitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudCorreccion" (
    "id" TEXT NOT NULL,
    "asistenciaId" TEXT NOT NULL,
    "entradaNueva" TIMESTAMPTZ NOT NULL,
    "salidaNueva" TIMESTAMPTZ NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "resueltoPor" TEXT,
    "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudCorreccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "fecha" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_nombre_key" ON "Carrera"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_usuarioId_key" ON "Alumno"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Institucion_qrTokenHash_key" ON "Institucion"("qrTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Institucion_codigoCorto_key" ON "Institucion"("codigoCorto");

-- CreateIndex
CREATE INDEX "Institucion_municipio_colonia_idx" ON "Institucion"("municipio", "colonia");

-- CreateIndex
CREATE UNIQUE INDEX "Institucion_plantelId_rfc_key" ON "Institucion"("plantelId", "rfc");

-- CreateIndex
CREATE INDEX "Supervisor_institucionId_idx" ON "Supervisor"("institucionId");

-- CreateIndex
CREATE INDEX "Expediente_alumnoId_idx" ON "Expediente"("alumnoId");

-- CreateIndex
CREATE INDEX "Expediente_institucionId_idx" ON "Expediente"("institucionId");

-- CreateIndex
CREATE INDEX "Asistencia_expedienteId_entrada_idx" ON "Asistencia"("expedienteId", "entrada");

-- CreateIndex
CREATE UNIQUE INDEX "SemanaBitacora_tokenHash_key" ON "SemanaBitacora"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "SemanaBitacora_expedienteId_semanaInicio_key" ON "SemanaBitacora"("expedienteId", "semanaInicio");

-- CreateIndex
CREATE INDEX "SolicitudCorreccion_asistenciaId_idx" ON "SolicitudCorreccion"("asistenciaId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_plantelId_fkey" FOREIGN KEY ("plantelId") REFERENCES "Plantel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institucion" ADD CONSTRAINT "Institucion_plantelId_fkey" FOREIGN KEY ("plantelId") REFERENCES "Plantel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitucionCarrera" ADD CONSTRAINT "InstitucionCarrera_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitucionCarrera" ADD CONSTRAINT "InstitucionCarrera_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supervisor" ADD CONSTRAINT "Supervisor_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "SemanaBitacora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanaBitacora" ADD CONSTRAINT "SemanaBitacora_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCorreccion" ADD CONSTRAINT "SolicitudCorreccion_asistenciaId_fkey" FOREIGN KEY ("asistenciaId") REFERENCES "Asistencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Constraints from docs/specs.md section 8.3 (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- No overlapping shifts within the same expediente
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Asistencia" ADD CONSTRAINT asistencia_sin_traslape
  EXCLUDE USING gist ("expedienteId" WITH =,
                      tstzrange("entrada", COALESCE("salida", 'infinity')) WITH &&);

-- Exit is always after entry
ALTER TABLE "Asistencia" ADD CONSTRAINT salida_despues_entrada
  CHECK ("salida" IS NULL OR "salida" > "entrada");

-- Only one open shift per expediente (RN-07)
CREATE UNIQUE INDEX un_turno_abierto
  ON "Asistencia" ("expedienteId") WHERE "estado" = 'ABIERTA';

-- Only one active expediente per student (RN-03)
CREATE UNIQUE INDEX un_expediente_activo
  ON "Expediente" ("alumnoId")
  WHERE "estado" IN ('PENDIENTE', 'EN_PROCESO', 'SUSPENDIDO');
