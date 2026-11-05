-- MEJ-106/107/109/110: subtareas, enlaces, responsables adicionales y respuestas/reacciones de comentarios (solo aditivo).
ALTER TABLE "tarea" ADD COLUMN "id_tarea_padre" INTEGER;

ALTER TABLE "comentario" ADD COLUMN "id_comentario_padre" INTEGER;

CREATE TABLE "tarea_enlace" (
	"id_enlace" SERIAL NOT NULL,
	"id_tarea" INTEGER NOT NULL,
	"url" VARCHAR(2048) NOT NULL,
	"titulo" VARCHAR(200),
	"sitio" VARCHAR(100),
	"tipo" VARCHAR(16) NOT NULL,
	"creado_por" INTEGER NOT NULL,
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "tarea_enlace_pkey" PRIMARY KEY ("id_enlace")
);

CREATE TABLE "tarea_responsable" (
	"id_tarea" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"asignado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "tarea_responsable_pkey" PRIMARY KEY ("id_tarea","id_usuario")
);

CREATE TABLE "reaccion_comentario" (
	"id_reaccion" SERIAL NOT NULL,
	"id_comentario" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"emoji" VARCHAR(16) NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "reaccion_comentario_pkey" PRIMARY KEY ("id_reaccion")
);

CREATE UNIQUE INDEX "tarea_enlace_id_tarea_url_key" ON "tarea_enlace"("id_tarea", "url");

CREATE INDEX "tarea_responsable_id_usuario_idx" ON "tarea_responsable"("id_usuario");

CREATE INDEX "reaccion_comentario_id_comentario_idx" ON "reaccion_comentario"("id_comentario");

CREATE UNIQUE INDEX "reaccion_comentario_id_comentario_id_usuario_emoji_key" ON "reaccion_comentario"("id_comentario", "id_usuario", "emoji");

CREATE INDEX "tarea_id_tarea_padre_idx" ON "tarea"("id_tarea_padre");

CREATE INDEX "comentario_id_comentario_padre_idx" ON "comentario"("id_comentario_padre");

ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_tarea_padre_fkey" FOREIGN KEY ("id_tarea_padre") REFERENCES "tarea"("id_tarea") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "tarea_enlace" ADD CONSTRAINT "tarea_enlace_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comentario" ADD CONSTRAINT "comentario_id_comentario_padre_fkey" FOREIGN KEY ("id_comentario_padre") REFERENCES "comentario"("id_comentario") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "reaccion_comentario" ADD CONSTRAINT "reaccion_comentario_id_comentario_fkey" FOREIGN KEY ("id_comentario") REFERENCES "comentario"("id_comentario") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reaccion_comentario" ADD CONSTRAINT "reaccion_comentario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
