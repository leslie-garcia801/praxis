-- Client UUID of the exit scan, so a retried exit is idempotent (RF-14, RN-14).
ALTER TABLE "asistencias" ADD COLUMN "salida_id" TEXT;

CREATE UNIQUE INDEX "asistencias_salida_id_key" ON "asistencias"("salida_id");
