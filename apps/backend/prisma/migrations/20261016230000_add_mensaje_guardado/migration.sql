-- CreateTable
CREATE TABLE "mensaje_guardado" (
    "id_usuario" INTEGER NOT NULL,
    "id_mensaje" INTEGER NOT NULL,
    "guardado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_guardado_pkey" PRIMARY KEY ("id_usuario","id_mensaje")
);

-- CreateIndex
CREATE INDEX "mensaje_guardado_id_usuario_guardado_en_idx" ON "mensaje_guardado"("id_usuario", "guardado_en");

-- AddForeignKey
ALTER TABLE "mensaje_guardado" ADD CONSTRAINT "mensaje_guardado_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_guardado" ADD CONSTRAINT "mensaje_guardado_id_mensaje_fkey" FOREIGN KEY ("id_mensaje") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE CASCADE ON UPDATE CASCADE;
