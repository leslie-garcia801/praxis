-- CreateTable
CREATE TABLE "responsables_oficina" (
    "id" TEXT NOT NULL,
    "plantel_id" TEXT NOT NULL,
    "oficina" "tipo_programa" NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "responsables_oficina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "responsables_oficina_plantel_id_oficina_key" ON "responsables_oficina"("plantel_id", "oficina");

-- AddForeignKey
ALTER TABLE "responsables_oficina" ADD CONSTRAINT "responsables_oficina_plantel_id_fkey" FOREIGN KEY ("plantel_id") REFERENCES "planteles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
