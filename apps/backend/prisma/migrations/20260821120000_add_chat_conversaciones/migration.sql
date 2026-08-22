-- CreateEnum
CREATE TYPE "TipoConversacion" AS ENUM ('GRUPAL', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "conversacion" (
    "id_conversacion" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "tipo" "TipoConversacion" NOT NULL,
    "nombre" VARCHAR(255),
    "creada_por" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversacion_pkey" PRIMARY KEY ("id_conversacion")
);

-- CreateTable
CREATE TABLE "conversacion_participante" (
    "id_conversacion" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "agregado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_lectura_en" TIMESTAMP(3),

    CONSTRAINT "conversacion_participante_pkey" PRIMARY KEY ("id_conversacion","id_usuario")
);

-- CreateTable
CREATE TABLE "mensaje_chat" (
    "id_mensaje" SERIAL NOT NULL,
    "id_conversacion" INTEGER NOT NULL,
    "id_remitente" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_chat_pkey" PRIMARY KEY ("id_mensaje")
);

-- CreateIndex
CREATE INDEX "conversacion_id_proyecto_idx" ON "conversacion"("id_proyecto");

-- CreateIndex
CREATE INDEX "conversacion_participante_id_usuario_idx" ON "conversacion_participante"("id_usuario");

-- CreateIndex
CREATE INDEX "mensaje_chat_id_conversacion_enviado_en_idx" ON "mensaje_chat"("id_conversacion", "enviado_en");

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_creada_por_fkey" FOREIGN KEY ("creada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_participante" ADD CONSTRAINT "conversacion_participante_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion"("id_conversacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_participante" ADD CONSTRAINT "conversacion_participante_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion"("id_conversacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_remitente_fkey" FOREIGN KEY ("id_remitente") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
