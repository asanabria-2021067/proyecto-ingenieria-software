-- MEJ-95: fecha limite de postulacion del proyecto (opcional).
ALTER TABLE "proyecto" ADD COLUMN "fecha_limite_postulacion" DATE;

-- MEJ-99: motivo del rechazo.
CREATE TYPE "MotivoRechazoPostulacion" AS ENUM ('PERFIL_NO_COINCIDE', 'CUPO_LLENO', 'HORARIO', 'OTRO');
ALTER TABLE "postulacion" ADD COLUMN "motivo_rechazo" "MotivoRechazoPostulacion";

-- MEJ-97: preguntas por rol y respuestas por postulacion.
CREATE TYPE "TipoPreguntaPostulacion" AS ENUM ('CORTA', 'LARGA');

CREATE TABLE "pregunta_rol" (
	"id_pregunta" SERIAL NOT NULL,
	"id_rol_proyecto" INTEGER NOT NULL,
	"enunciado" VARCHAR(200) NOT NULL,
	"tipo" "TipoPreguntaPostulacion" NOT NULL,
	"obligatoria" BOOLEAN NOT NULL DEFAULT true,
	"orden" INTEGER NOT NULL DEFAULT 0,

	CONSTRAINT "pregunta_rol_pkey" PRIMARY KEY ("id_pregunta")
);

CREATE INDEX "pregunta_rol_id_rol_proyecto_idx" ON "pregunta_rol"("id_rol_proyecto");

ALTER TABLE "pregunta_rol" ADD CONSTRAINT "pregunta_rol_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "respuesta_postulacion" (
	"id_respuesta" SERIAL NOT NULL,
	"id_postulacion" INTEGER NOT NULL,
	"id_pregunta" INTEGER,
	"enunciado" VARCHAR(200) NOT NULL,
	"tipo" "TipoPreguntaPostulacion" NOT NULL,
	"respuesta" TEXT NOT NULL,
	"orden" INTEGER NOT NULL DEFAULT 0,

	CONSTRAINT "respuesta_postulacion_pkey" PRIMARY KEY ("id_respuesta")
);

CREATE INDEX "respuesta_postulacion_id_postulacion_idx" ON "respuesta_postulacion"("id_postulacion");

ALTER TABLE "respuesta_postulacion" ADD CONSTRAINT "respuesta_postulacion_id_postulacion_fkey" FOREIGN KEY ("id_postulacion") REFERENCES "postulacion"("id_postulacion") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respuesta_postulacion" ADD CONSTRAINT "respuesta_postulacion_id_pregunta_fkey" FOREIGN KEY ("id_pregunta") REFERENCES "pregunta_rol"("id_pregunta") ON DELETE SET NULL ON UPDATE CASCADE;

-- MEJ-100: linea de tiempo de la postulacion.
CREATE TYPE "TipoEventoPostulacion" AS ENUM ('ENVIADA', 'VISTA', 'EN_REVISION', 'ACEPTADA', 'RECHAZADA', 'RETIRADA');

CREATE TABLE "evento_postulacion" (
	"id_evento" SERIAL NOT NULL,
	"id_postulacion" INTEGER NOT NULL,
	"tipo" "TipoEventoPostulacion" NOT NULL,
	"fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "evento_postulacion_pkey" PRIMARY KEY ("id_evento")
);

CREATE UNIQUE INDEX "evento_postulacion_id_postulacion_tipo_key" ON "evento_postulacion"("id_postulacion", "tipo");

ALTER TABLE "evento_postulacion" ADD CONSTRAINT "evento_postulacion_id_postulacion_fkey" FOREIGN KEY ("id_postulacion") REFERENCES "postulacion"("id_postulacion") ON DELETE CASCADE ON UPDATE CASCADE;
