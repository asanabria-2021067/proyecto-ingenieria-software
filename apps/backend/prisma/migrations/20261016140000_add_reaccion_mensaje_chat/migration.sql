-- CreateTable
CREATE TABLE "reaccion_mensaje_chat" (
    "id_reaccion" SERIAL NOT NULL,
    "id_mensaje" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaccion_mensaje_chat_pkey" PRIMARY KEY ("id_reaccion")
);

-- CreateIndex
CREATE INDEX "reaccion_mensaje_chat_id_mensaje_idx" ON "reaccion_mensaje_chat"("id_mensaje");

-- CreateIndex
CREATE UNIQUE INDEX "reaccion_mensaje_chat_id_mensaje_id_usuario_emoji_key" ON "reaccion_mensaje_chat"("id_mensaje", "id_usuario", "emoji");

-- AddForeignKey
ALTER TABLE "reaccion_mensaje_chat" ADD CONSTRAINT "reaccion_mensaje_chat_id_mensaje_fkey" FOREIGN KEY ("id_mensaje") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaccion_mensaje_chat" ADD CONSTRAINT "reaccion_mensaje_chat_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
