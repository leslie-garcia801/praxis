-- AlterTable
ALTER TABLE "asistencias" ADD COLUMN     "recordatorio_enviado_en" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "semanas_bitacora" ADD COLUMN     "recordatorio_bitacora_en" TIMESTAMPTZ;
