-- MEJ-16/17/18/22: avisos de descubrimiento, seguir organizaciones y asociaciones,
-- e invitacion directa del lider a un rol. Aditiva: no toca datos existentes.

-- CreateEnum
CREATE TYPE "EstadoInvitacionRol" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_NUEVO_PARA_TI';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_GUARDADO_AVISO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'INVITACION_ROL_PROYECTO';

-- CreateTable
CREATE TABLE "seguimiento_entidad" (
	"id_seguimiento_entidad" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"id_organizacion" INTEGER,
	"id_asociacion" INTEGER,
	"fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "seguimiento_entidad_pkey" PRIMARY KEY ("id_seguimiento_entidad")
);

-- CreateTable
CREATE TABLE "invitacion_rol_proyecto" (
	"id_invitacion_rol" SERIAL NOT NULL,
	"id_rol_proyecto" INTEGER NOT NULL,
	"id_invitado" INTEGER NOT NULL,
	"id_invitado_por" INTEGER NOT NULL,
	"mensaje" VARCHAR(500),
	"estado" "EstadoInvitacionRol" NOT NULL DEFAULT 'PENDIENTE',
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"resuelta_en" TIMESTAMP(3),

	CONSTRAINT "invitacion_rol_proyecto_pkey" PRIMARY KEY ("id_invitacion_rol")
);

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_entidad_id_usuario_id_organizacion_key" ON "seguimiento_entidad"("id_usuario", "id_organizacion");

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_entidad_id_usuario_id_asociacion_key" ON "seguimiento_entidad"("id_usuario", "id_asociacion");

-- CreateIndex
CREATE INDEX "seguimiento_entidad_id_organizacion_idx" ON "seguimiento_entidad"("id_organizacion");

-- CreateIndex
CREATE INDEX "seguimiento_entidad_id_asociacion_idx" ON "seguimiento_entidad"("id_asociacion");

-- CreateIndex
CREATE INDEX "invitacion_rol_proyecto_id_invitado_estado_idx" ON "invitacion_rol_proyecto"("id_invitado", "estado");

-- CreateIndex
CREATE INDEX "invitacion_rol_proyecto_id_rol_proyecto_estado_idx" ON "invitacion_rol_proyecto"("id_rol_proyecto", "estado");

-- AddForeignKey
ALTER TABLE "seguimiento_entidad" ADD CONSTRAINT "seguimiento_entidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento_entidad" ADD CONSTRAINT "seguimiento_entidad_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento_entidad" ADD CONSTRAINT "seguimiento_entidad_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion_rol_proyecto" ADD CONSTRAINT "invitacion_rol_proyecto_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion_rol_proyecto" ADD CONSTRAINT "invitacion_rol_proyecto_id_invitado_fkey" FOREIGN KEY ("id_invitado") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion_rol_proyecto" ADD CONSTRAINT "invitacion_rol_proyecto_id_invitado_por_fkey" FOREIGN KEY ("id_invitado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Se sigue a una organizacion o a una asociacion, nunca a ambas ni a ninguna.
ALTER TABLE "seguimiento_entidad" ADD CONSTRAINT "seguimiento_entidad_una_entidad_check"
	CHECK (("id_organizacion" IS NULL) <> ("id_asociacion" IS NULL));

-- Una sola invitacion pendiente por persona y rol.
CREATE UNIQUE INDEX "invitacion_rol_proyecto_pendiente_key" ON "invitacion_rol_proyecto"("id_rol_proyecto", "id_invitado")
	WHERE "estado" = 'PENDIENTE';
