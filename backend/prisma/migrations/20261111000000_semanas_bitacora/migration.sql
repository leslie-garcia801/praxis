-- Logbook weeks (RF-19, RF-20): when the week was sent and when the logbook was last edited.
ALTER TABLE "semanas_bitacora" ADD COLUMN "enviada_en" TIMESTAMPTZ;
ALTER TABLE "semanas_bitacora" ADD COLUMN "bitacora_actualizada_en" TIMESTAMPTZ;

-- BACKFILL START
-- Data migration: every existing attendance belongs to the week (Monday to Sunday, America/Monterrey)
-- of its entry. Create the missing weeks, then link the attendances. Idempotent: it can run again safely.
INSERT INTO "semanas_bitacora" ("id", "expediente_id", "semana_inicio")
SELECT gen_random_uuid()::text, s."expediente_id", s."semana_inicio"
FROM (
  SELECT DISTINCT "expediente_id", date_trunc('week', "entrada" AT TIME ZONE 'America/Monterrey')::date AS "semana_inicio"
  FROM "asistencias"
  WHERE "semana_id" IS NULL
) s
ON CONFLICT ("expediente_id", "semana_inicio") DO NOTHING;

UPDATE "asistencias" a
SET "semana_id" = s."id"
FROM "semanas_bitacora" s
WHERE a."semana_id" IS NULL
  AND s."expediente_id" = a."expediente_id"
  AND s."semana_inicio" = date_trunc('week', a."entrada" AT TIME ZONE 'America/Monterrey')::date;
-- BACKFILL END
