-- CreateEnum
CREATE TYPE "EstadoMensajeProgramado" AS ENUM ('PENDIENTE', 'ENVIADO', 'CANCELADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "mensaje_programado" (
    "id_mensaje_programado" SERIAL NOT NULL,
    "id_conversacion" INTEGER NOT NULL,
    "id_remitente" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "enviar_en" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoMensajeProgramado" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),
    "id_mensaje" INTEGER,

    CONSTRAINT "mensaje_programado_pkey" PRIMARY KEY ("id_mensaje_programado")
);

-- CreateIndex
CREATE INDEX "mensaje_programado_estado_enviar_en_idx" ON "mensaje_programado"("estado", "enviar_en");

-- CreateIndex
CREATE INDEX "mensaje_programado_id_conversacion_id_remitente_idx" ON "mensaje_programado"("id_conversacion", "id_remitente");

-- AddForeignKey
ALTER TABLE "mensaje_programado" ADD CONSTRAINT "mensaje_programado_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion"("id_conversacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_programado" ADD CONSTRAINT "mensaje_programado_id_remitente_fkey" FOREIGN KEY ("id_remitente") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
