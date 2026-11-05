-- MEJ-161/162: aviso de la junta (tipo de notificacion y destinatarios del anuncio) y metas de la asociacion. Solo aditivo.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'AVISO_ASOCIACION';

CREATE TYPE "TipoHorasMeta" AS ENUM ('BECA', 'EXTENSION');

CREATE TABLE "anuncio_destinatario" (
	"id_anuncio" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,

	CONSTRAINT "anuncio_destinatario_pkey" PRIMARY KEY ("id_anuncio", "id_usuario")
);

CREATE INDEX "anuncio_destinatario_id_usuario_idx" ON "anuncio_destinatario"("id_usuario");

ALTER TABLE "anuncio_destinatario" ADD CONSTRAINT "anuncio_destinatario_id_anuncio_fkey" FOREIGN KEY ("id_anuncio") REFERENCES "anuncio"("id_anuncio") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "anuncio_destinatario" ADD CONSTRAINT "anuncio_destinatario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "meta_asociacion" (
	"id_meta" SERIAL NOT NULL,
	"id_asociacion" INTEGER NOT NULL,
	"anio" INTEGER NOT NULL,
	"periodo" INTEGER NOT NULL,
	"tipo" "TipoHorasMeta" NOT NULL,
	"porcentaje_objetivo" INTEGER NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"actualizada_en" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "meta_asociacion_pkey" PRIMARY KEY ("id_meta"),
	CONSTRAINT "meta_asociacion_periodo_check" CHECK ("periodo" IN (1, 2)),
	CONSTRAINT "meta_asociacion_porcentaje_check" CHECK ("porcentaje_objetivo" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "meta_asociacion_id_asociacion_anio_periodo_tipo_key" ON "meta_asociacion"("id_asociacion", "anio", "periodo", "tipo");

ALTER TABLE "meta_asociacion" ADD CONSTRAINT "meta_asociacion_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE CASCADE ON UPDATE CASCADE;
