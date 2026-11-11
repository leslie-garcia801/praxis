-- Validation links (RF-21, RF-21a): the token now belongs to a link that groups several weeks of one supervisor.
-- Only the SHA-256 hash of the token is stored (RNF-06). The old per-week token columns held no data.

DROP INDEX "semanas_bitacora_token_hash_key";
ALTER TABLE "semanas_bitacora" DROP COLUMN "token_hash";
ALTER TABLE "semanas_bitacora" DROP COLUMN "token_expira";

CREATE TABLE "enlaces_validacion" (
    "id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enlaces_validacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enlaces_validacion_semanas" (
    "enlace_id" TEXT NOT NULL,
    "semana_id" TEXT NOT NULL,

    CONSTRAINT "enlaces_validacion_semanas_pkey" PRIMARY KEY ("enlace_id","semana_id")
);

CREATE UNIQUE INDEX "enlaces_validacion_token_hash_key" ON "enlaces_validacion"("token_hash");
CREATE INDEX "enlaces_validacion_supervisor_id_idx" ON "enlaces_validacion"("supervisor_id");
CREATE INDEX "enlaces_validacion_semanas_semana_id_idx" ON "enlaces_validacion_semanas"("semana_id");

ALTER TABLE "enlaces_validacion" ADD CONSTRAINT "enlaces_validacion_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "supervisores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enlaces_validacion_semanas" ADD CONSTRAINT "enlaces_validacion_semanas_enlace_id_fkey" FOREIGN KEY ("enlace_id") REFERENCES "enlaces_validacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enlaces_validacion_semanas" ADD CONSTRAINT "enlaces_validacion_semanas_semana_id_fkey" FOREIGN KEY ("semana_id") REFERENCES "semanas_bitacora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
