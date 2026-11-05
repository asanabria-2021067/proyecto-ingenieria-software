-- MEJ-131/132/136/137: hilos del chat, estado «En reunión», horario de silencio y suscripciones Web Push. Solo aditivo.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'RESPUESTA_HILO_CHAT';
ALTER TYPE "TipoEstadoChat" ADD VALUE IF NOT EXISTS 'EN_REUNION';

ALTER TABLE "mensaje_chat" ADD COLUMN "id_mensaje_padre" INTEGER;
CREATE INDEX "mensaje_chat_id_mensaje_padre_id_mensaje_idx" ON "mensaje_chat"("id_mensaje_padre", "id_mensaje");
ALTER TABLE "mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_mensaje_padre_fkey" FOREIGN KEY ("id_mensaje_padre") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "preferencia_silencio_notificacion" (
	"id_usuario" INTEGER NOT NULL,
	"activo" BOOLEAN NOT NULL DEFAULT false,
	"hora_inicio" VARCHAR(5) NOT NULL DEFAULT '22:00',
	"hora_fin" VARCHAR(5) NOT NULL DEFAULT '07:00',
	"actualizado_en" TIMESTAMP(3) NOT NULL,
	CONSTRAINT "preferencia_silencio_notificacion_pkey" PRIMARY KEY ("id_usuario")
);

CREATE TABLE "suscripcion_push" (
	"id_suscripcion" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"endpoint" VARCHAR(1000) NOT NULL,
	"p256dh" VARCHAR(255) NOT NULL,
	"auth" VARCHAR(255) NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id_suscripcion")
);

CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");
CREATE INDEX "suscripcion_push_id_usuario_idx" ON "suscripcion_push"("id_usuario");

ALTER TABLE "preferencia_silencio_notificacion" ADD CONSTRAINT "preferencia_silencio_notificacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
