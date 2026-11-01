-- ORG-2..7: organizaciones estilo GitHub. Visibilidad, roles EDITOR/LECTURA,
-- invitaciones y solicitudes con vencimiento y chat de organizacion.

-- CreateEnum
CREATE TYPE "VisibilidadOrganizacion" AS ENUM ('PUBLICA', 'PRIVADA');

-- CreateEnum
CREATE TYPE "EstadoInvitacionOrganizacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "RolOrganizacion" ADD VALUE IF NOT EXISTS 'EDITOR';
ALTER TYPE "RolOrganizacion" ADD VALUE IF NOT EXISTS 'LECTURA';

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'INVITACION_ORGANIZACION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOLICITUD_UNIRSE_ORGANIZACION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ORGANIZACION_ACTUALIZADA';

-- AlterTable
ALTER TABLE "organizacion" ADD COLUMN "visibilidad" "VisibilidadOrganizacion" NOT NULL DEFAULT 'PRIVADA';

-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN "id_organizacion" INTEGER,
ALTER COLUMN "id_proyecto" DROP NOT NULL;

-- CreateTable
CREATE TABLE "invitacion_organizacion" (
	"id_invitacion" SERIAL NOT NULL,
	"id_organizacion" INTEGER NOT NULL,
	"id_invitado" INTEGER NOT NULL,
	"id_invitado_por" INTEGER NOT NULL,
	"rol_organizacion" "RolOrganizacion" NOT NULL,
	"estado" "EstadoInvitacionOrganizacion" NOT NULL DEFAULT 'PENDIENTE',
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"vence_en" TIMESTAMP(3) NOT NULL,
	"resuelta_en" TIMESTAMP(3),

	CONSTRAINT "invitacion_organizacion_pkey" PRIMARY KEY ("id_invitacion")
);

-- CreateTable
CREATE TABLE "solicitud_unirse_organizacion" (
	"id_solicitud" SERIAL NOT NULL,
	"id_organizacion" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"estado" "EstadoInvitacionOrganizacion" NOT NULL DEFAULT 'PENDIENTE',
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"vence_en" TIMESTAMP(3) NOT NULL,
	"resuelta_en" TIMESTAMP(3),
	"resuelta_por" INTEGER,

	CONSTRAINT "solicitud_unirse_organizacion_pkey" PRIMARY KEY ("id_solicitud")
);

-- CreateIndex
CREATE INDEX "invitacion_organizacion_id_invitado_estado_idx" ON "invitacion_organizacion"("id_invitado", "estado");

-- CreateIndex
CREATE INDEX "invitacion_organizacion_id_organizacion_estado_idx" ON "invitacion_organizacion"("id_organizacion", "estado");

-- CreateIndex
CREATE INDEX "solicitud_unirse_organizacion_id_usuario_estado_idx" ON "solicitud_unirse_organizacion"("id_usuario", "estado");

-- CreateIndex
CREATE INDEX "solicitud_unirse_organizacion_id_organizacion_estado_idx" ON "solicitud_unirse_organizacion"("id_organizacion", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_id_organizacion_nombre_canal_key" ON "conversacion"("id_organizacion", "nombre_canal");

-- AddForeignKey
ALTER TABLE "invitacion_organizacion" ADD CONSTRAINT "invitacion_organizacion_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion_organizacion" ADD CONSTRAINT "invitacion_organizacion_id_invitado_fkey" FOREIGN KEY ("id_invitado") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion_organizacion" ADD CONSTRAINT "invitacion_organizacion_id_invitado_por_fkey" FOREIGN KEY ("id_invitado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_unirse_organizacion" ADD CONSTRAINT "solicitud_unirse_organizacion_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_unirse_organizacion" ADD CONSTRAINT "solicitud_unirse_organizacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_unirse_organizacion" ADD CONSTRAINT "solicitud_unirse_organizacion_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un chat pertenece a un proyecto o a una organizacion, nunca a ambos ni a ninguno.
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_proyecto_u_organizacion_check"
	CHECK (("id_proyecto" IS NULL) <> ("id_organizacion" IS NULL));

-- Nombre de organizacion unico sin distinguir mayusculas.
CREATE UNIQUE INDEX "organizacion_nombre_organizacion_lower_key" ON "organizacion"(lower("nombre_organizacion"));

-- Siempre exactamente un Propietario activo por organizacion (el "al menos uno" lo da el servicio).
CREATE UNIQUE INDEX "usuario_organizacion_un_propietario_key" ON "usuario_organizacion"("id_organizacion")
	WHERE "rol_organizacion" = 'PROPIETARIO' AND "estado_membresia" = 'ACTIVA';

-- Una sola invitacion / solicitud pendiente por persona y organizacion.
CREATE UNIQUE INDEX "invitacion_organizacion_pendiente_key" ON "invitacion_organizacion"("id_organizacion", "id_invitado")
	WHERE "estado" = 'PENDIENTE';

CREATE UNIQUE INDEX "solicitud_unirse_organizacion_pendiente_key" ON "solicitud_unirse_organizacion"("id_organizacion", "id_usuario")
	WHERE "estado" = 'PENDIENTE';
