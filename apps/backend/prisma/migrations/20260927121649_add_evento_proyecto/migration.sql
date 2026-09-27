-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'RECORDATORIO_EVENTO';

-- CreateTable
CREATE TABLE "evento_proyecto" (
    "id_evento" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_creador" INTEGER NOT NULL,
    "titulo_evento" VARCHAR(200) NOT NULL,
    "descripcion_evento" TEXT,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "antelacion_minutos" INTEGER NOT NULL DEFAULT 60,
    "recordatorio_enviado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3),
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "evento_proyecto_pkey" PRIMARY KEY ("id_evento")
);

-- CreateIndex
CREATE INDEX "evento_proyecto_id_proyecto_eliminado_en_idx" ON "evento_proyecto"("id_proyecto", "eliminado_en");

-- CreateIndex
CREATE INDEX "evento_proyecto_fecha_inicio_idx" ON "evento_proyecto"("fecha_inicio");

-- CreateIndex
CREATE INDEX "evento_proyecto_eliminado_en_recordatorio_enviado_en_fecha__idx" ON "evento_proyecto"("eliminado_en", "recordatorio_enviado_en", "fecha_inicio");

-- AddForeignKey
ALTER TABLE "evento_proyecto" ADD CONSTRAINT "evento_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_proyecto" ADD CONSTRAINT "evento_proyecto_id_creador_fkey" FOREIGN KEY ("id_creador") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
