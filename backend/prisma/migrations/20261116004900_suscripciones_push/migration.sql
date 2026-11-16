-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripciones_push_usuario_id_idx" ON "suscripciones_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
