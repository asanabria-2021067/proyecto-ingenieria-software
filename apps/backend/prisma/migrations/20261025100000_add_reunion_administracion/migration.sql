-- HU-195 (T-362): reuniones de Administración con uno o varios proyectos.
-- Aditiva: tabla padre (identidad, versión, cancelación) y FK opcional en
-- evento_proyecto. Los eventos existentes quedan con id_reunion NULL, y el
-- índice único (id_reunion, id_proyecto) admite varios NULL en PostgreSQL,
-- así que los eventos ordinarios no cambian.

-- AlterTable
ALTER TABLE "evento_proyecto" ADD COLUMN     "id_reunion" INTEGER;

-- CreateTable
CREATE TABLE "reunion_administracion" (
    "id_reunion" SERIAL NOT NULL,
    "id_creador" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMP(3),
    "cancelada_en" TIMESTAMP(3),

    CONSTRAINT "reunion_administracion_pkey" PRIMARY KEY ("id_reunion")
);

-- CreateIndex
CREATE INDEX "reunion_administracion_cancelada_en_creada_en_idx" ON "reunion_administracion"("cancelada_en", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "evento_proyecto_id_reunion_id_proyecto_key" ON "evento_proyecto"("id_reunion", "id_proyecto");

-- AddForeignKey
ALTER TABLE "evento_proyecto" ADD CONSTRAINT "evento_proyecto_id_reunion_fkey" FOREIGN KEY ("id_reunion") REFERENCES "reunion_administracion"("id_reunion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunion_administracion" ADD CONSTRAINT "reunion_administracion_id_creador_fkey" FOREIGN KEY ("id_creador") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
