-- CreateTable
CREATE TABLE "token_refresco" (
    "id_token_refresco" TEXT NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado_en" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_refresco_pkey" PRIMARY KEY ("id_token_refresco")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_refresco_token_hash_key" ON "token_refresco"("token_hash");

-- CreateIndex
CREATE INDEX "token_refresco_id_usuario_idx" ON "token_refresco"("id_usuario");

-- AddForeignKey
ALTER TABLE "token_refresco" ADD CONSTRAINT "token_refresco_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
