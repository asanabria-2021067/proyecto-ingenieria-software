-- CreateTable
CREATE TABLE "adjunto_mensaje_chat" (
    "id_adjunto" SERIAL NOT NULL,
    "id_mensaje" INTEGER NOT NULL,
    "id_conversacion" INTEGER NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "clave_almacenamiento" VARCHAR(255) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjunto_mensaje_chat_pkey" PRIMARY KEY ("id_adjunto")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjunto_mensaje_chat_id_mensaje_key" ON "adjunto_mensaje_chat"("id_mensaje");

-- CreateIndex
CREATE INDEX "adjunto_mensaje_chat_id_conversacion_id_mensaje_idx" ON "adjunto_mensaje_chat"("id_conversacion", "id_mensaje");

-- AddForeignKey
ALTER TABLE "adjunto_mensaje_chat" ADD CONSTRAINT "adjunto_mensaje_chat_id_mensaje_fkey" FOREIGN KEY ("id_mensaje") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjunto_mensaje_chat" ADD CONSTRAINT "adjunto_mensaje_chat_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion"("id_conversacion") ON DELETE RESTRICT ON UPDATE CASCADE;
