-- MEJ-41/42/43: notas de voz, encuestas y mensajes fijados del chat.
ALTER TABLE "adjunto_mensaje_chat" ADD COLUMN "duracion_segundos" INTEGER;
ALTER TABLE "adjunto_mensaje_chat"
	ADD CONSTRAINT "adjunto_mensaje_chat_duracion_check" CHECK ("duracion_segundos" IS NULL OR ("duracion_segundos" BETWEEN 1 AND 120));

ALTER TABLE "mensaje_chat" ADD COLUMN "fijado_en" TIMESTAMP(3);
CREATE INDEX "mensaje_chat_id_conversacion_fijado_en_idx" ON "mensaje_chat"("id_conversacion", "fijado_en");

CREATE TABLE "encuesta_chat" (
	"id_encuesta" SERIAL NOT NULL,
	"id_mensaje" INTEGER NOT NULL,
	"pregunta" VARCHAR(300) NOT NULL,
	"multiple" BOOLEAN NOT NULL DEFAULT false,
	"cierra_en" TIMESTAMP(3),
	"cerrada_en" TIMESTAMP(3),
	CONSTRAINT "encuesta_chat_pkey" PRIMARY KEY ("id_encuesta")
);

CREATE UNIQUE INDEX "encuesta_chat_id_mensaje_key" ON "encuesta_chat"("id_mensaje");

CREATE TABLE "opcion_encuesta_chat" (
	"id_opcion" SERIAL NOT NULL,
	"id_encuesta" INTEGER NOT NULL,
	"texto" VARCHAR(120) NOT NULL,
	"orden" INTEGER NOT NULL,
	CONSTRAINT "opcion_encuesta_chat_pkey" PRIMARY KEY ("id_opcion")
);

CREATE INDEX "opcion_encuesta_chat_id_encuesta_idx" ON "opcion_encuesta_chat"("id_encuesta");

CREATE TABLE "voto_encuesta_chat" (
	"id_opcion" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"votado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "voto_encuesta_chat_pkey" PRIMARY KEY ("id_opcion", "id_usuario")
);

CREATE INDEX "voto_encuesta_chat_id_usuario_idx" ON "voto_encuesta_chat"("id_usuario");

ALTER TABLE "encuesta_chat"
	ADD CONSTRAINT "encuesta_chat_id_mensaje_fkey"
	FOREIGN KEY ("id_mensaje") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opcion_encuesta_chat"
	ADD CONSTRAINT "opcion_encuesta_chat_id_encuesta_fkey"
	FOREIGN KEY ("id_encuesta") REFERENCES "encuesta_chat"("id_encuesta") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voto_encuesta_chat"
	ADD CONSTRAINT "voto_encuesta_chat_id_opcion_fkey"
	FOREIGN KEY ("id_opcion") REFERENCES "opcion_encuesta_chat"("id_opcion") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voto_encuesta_chat"
	ADD CONSTRAINT "voto_encuesta_chat_id_usuario_fkey"
	FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
