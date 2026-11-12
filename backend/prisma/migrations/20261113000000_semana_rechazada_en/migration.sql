-- RF-22: instant the supervisor rejected a week, to know whether the student fixed the logbook afterwards (0022).
ALTER TABLE "semanas_bitacora" ADD COLUMN "rechazada_en" TIMESTAMPTZ;
