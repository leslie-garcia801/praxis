-- AlterTable
ALTER TABLE "solicitudes_correccion" ADD COLUMN     "comentario" TEXT,
ADD COLUMN     "resuelto_en" TIMESTAMPTZ;

-- RF-17: at most one pending correction request per attendance.
CREATE UNIQUE INDEX "una_correccion_pendiente"
  ON "solicitudes_correccion" ("asistencia_id")
  WHERE "estado" = 'PENDIENTE';
