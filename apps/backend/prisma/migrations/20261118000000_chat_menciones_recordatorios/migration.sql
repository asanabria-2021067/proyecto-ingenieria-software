-- MEJ-44/46: menciones @ en el chat y «Recuérdamelo». Valores nuevos al final del enum.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'MENCION_CHAT';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'RECORDATORIO_MENSAJE';

CREATE TABLE "recordatorio_mensaje" (
	"id_recordatorio" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"id_mensaje" INTEGER NOT NULL,
	"recordar_en" TIMESTAMP(3) NOT NULL,
	"estado" "EstadoMensajeProgramado" NOT NULL DEFAULT 'PENDIENTE',
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "recordatorio_mensaje_pkey" PRIMARY KEY ("id_recordatorio")
);

CREATE INDEX "recordatorio_mensaje_estado_recordar_en_idx" ON "recordatorio_mensaje"("estado", "recordar_en");
CREATE INDEX "recordatorio_mensaje_id_usuario_estado_idx" ON "recordatorio_mensaje"("id_usuario", "estado");

ALTER TABLE "recordatorio_mensaje" ADD CONSTRAINT "recordatorio_mensaje_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recordatorio_mensaje" ADD CONSTRAINT "recordatorio_mensaje_id_mensaje_fkey" FOREIGN KEY ("id_mensaje") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE RESTRICT ON UPDATE CASCADE;
