-- CreateEnum
CREATE TYPE "origen_asistencia" AS ENUM ('QR', 'LIBRETA');

-- AlterTable
ALTER TABLE "asistencias" ADD COLUMN     "origen" "origen_asistencia" NOT NULL DEFAULT 'QR';

-- AlterTable
ALTER TABLE "semanas_bitacora" ADD COLUMN     "de_libreta" BOOLEAN NOT NULL DEFAULT false;
