-- MEJ-81/82/85: metadatos de sesion, dispositivos conocidos y solicitudes de desactivacion. ADITIVA.
CREATE TYPE "EstadoSolicitudDesactivacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

ALTER TABLE "token_refresco"
	ADD COLUMN "id_sesion" VARCHAR(36),
	ADD COLUMN "navegador" VARCHAR(60),
	ADD COLUMN "sistema" VARCHAR(60),
	ADD COLUMN "huella" VARCHAR(64);

UPDATE "token_refresco" SET "id_sesion" = gen_random_uuid()::text WHERE "id_sesion" IS NULL;

CREATE INDEX "token_refresco_id_sesion_idx" ON "token_refresco"("id_sesion");

CREATE TABLE "dispositivo_usuario" (
	"id_dispositivo" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"huella" VARCHAR(64) NOT NULL,
	"navegador" VARCHAR(60) NOT NULL,
	"sistema" VARCHAR(60) NOT NULL,
	"primera_vez_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"ultima_vez_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "dispositivo_usuario_pkey" PRIMARY KEY ("id_dispositivo")
);

CREATE UNIQUE INDEX "dispositivo_usuario_id_usuario_huella_key" ON "dispositivo_usuario"("id_usuario", "huella");

ALTER TABLE "dispositivo_usuario"
	ADD CONSTRAINT "dispositivo_usuario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "solicitud_desactivacion" (
	"id_solicitud" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"motivo" VARCHAR(500),
	"estado" "EstadoSolicitudDesactivacion" NOT NULL DEFAULT 'PENDIENTE',
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"resuelta_en" TIMESTAMP(3),
	"resuelta_por" INTEGER,
	"comentario_resolucion" VARCHAR(500),
	CONSTRAINT "solicitud_desactivacion_pkey" PRIMARY KEY ("id_solicitud")
);

CREATE INDEX "solicitud_desactivacion_estado_idx" ON "solicitud_desactivacion"("estado");
CREATE INDEX "solicitud_desactivacion_id_usuario_idx" ON "solicitud_desactivacion"("id_usuario");

CREATE UNIQUE INDEX "solicitud_desactivacion_un_pendiente_por_usuario" ON "solicitud_desactivacion"("id_usuario") WHERE "estado" = 'PENDIENTE';

ALTER TABLE "solicitud_desactivacion"
	ADD CONSTRAINT "solicitud_desactivacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE,
	ADD CONSTRAINT "solicitud_desactivacion_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
