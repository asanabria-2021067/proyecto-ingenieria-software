-- CreateEnum
CREATE TYPE "EstadoAmistad" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacion" ADD VALUE 'SOLICITUD_AMISTAD';
ALTER TYPE "TipoNotificacion" ADD VALUE 'AMISTAD_ACEPTADA';
ALTER TYPE "TipoNotificacion" ADD VALUE 'NUEVO_SEGUIDOR';

-- DropForeignKey
ALTER TABLE "comentario" DROP CONSTRAINT "comentario_id_hito_fkey";

-- DropForeignKey
ALTER TABLE "comentario" DROP CONSTRAINT "comentario_id_proyecto_fkey";

-- DropForeignKey
ALTER TABLE "comentario" DROP CONSTRAINT "comentario_id_tarea_fkey";

-- CreateTable
CREATE TABLE "amistad" (
    "id_amistad" SERIAL NOT NULL,
    "id_usuario_solicitante" INTEGER NOT NULL,
    "id_usuario_receptor" INTEGER NOT NULL,
    "estado" "EstadoAmistad" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMP(3),

    CONSTRAINT "amistad_pkey" PRIMARY KEY ("id_amistad")
);

-- CreateTable
CREATE TABLE "seguimiento" (
    "id_seguimiento" SERIAL NOT NULL,
    "id_seguidor" INTEGER NOT NULL,
    "id_seguido" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seguimiento_pkey" PRIMARY KEY ("id_seguimiento")
);

-- CreateIndex
CREATE UNIQUE INDEX "amistad_id_usuario_solicitante_id_usuario_receptor_key" ON "amistad"("id_usuario_solicitante", "id_usuario_receptor");

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_id_seguidor_id_seguido_key" ON "seguimiento"("id_seguidor", "id_seguido");

-- CreateIndex
CREATE INDEX "notificacion_id_usuario_leida_en_idx" ON "notificacion"("id_usuario", "leida_en");

-- CreateIndex
CREATE INDEX "notificacion_id_usuario_creada_en_idx" ON "notificacion"("id_usuario", "creada_en");

-- CreateIndex
CREATE INDEX "notificacion_tipo_notificacion_idx" ON "notificacion"("tipo_notificacion");

-- CreateIndex
CREATE INDEX "participacion_proyecto_id_rol_proyecto_estado_participacion_idx" ON "participacion_proyecto"("id_rol_proyecto", "estado_participacion");

-- CreateIndex
CREATE INDEX "participacion_proyecto_id_usuario_estado_participacion_idx" ON "participacion_proyecto"("id_usuario", "estado_participacion");

-- CreateIndex
CREATE INDEX "postulacion_id_usuario_postulante_id_rol_proyecto_idx" ON "postulacion"("id_usuario_postulante", "id_rol_proyecto");

-- CreateIndex
CREATE INDEX "postulacion_estado_postulacion_idx" ON "postulacion"("estado_postulacion");

-- CreateIndex
CREATE INDEX "postulacion_id_rol_proyecto_estado_postulacion_idx" ON "postulacion"("id_rol_proyecto", "estado_postulacion");

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_id_usuario_solicitante_fkey" FOREIGN KEY ("id_usuario_solicitante") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_id_usuario_receptor_fkey" FOREIGN KEY ("id_usuario_receptor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_id_seguidor_fkey" FOREIGN KEY ("id_seguidor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_id_seguido_fkey" FOREIGN KEY ("id_seguido") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario" ADD CONSTRAINT "comentario_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario" ADD CONSTRAINT "comentario_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario" ADD CONSTRAINT "comentario_id_hito_fkey" FOREIGN KEY ("id_hito") REFERENCES "hito"("id_hito") ON DELETE SET NULL ON UPDATE CASCADE;
