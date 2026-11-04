ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ALCANCE_COORDINADOR';

ALTER TABLE "proyecto" ADD COLUMN "id_carrera" INTEGER;

CREATE INDEX "proyecto_id_carrera_idx" ON "proyecto"("id_carrera");

ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_carrera_fkey" FOREIGN KEY ("id_carrera") REFERENCES "carrera"("id_carrera") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "alcance_coordinador" (
	"id_alcance_coordinador" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"id_carrera" INTEGER,
	"facultad" VARCHAR(255),
	"asignado_por" INTEGER,
	"fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "alcance_coordinador_pkey" PRIMARY KEY ("id_alcance_coordinador"),
	CONSTRAINT "alcance_coordinador_una_sola_chk" CHECK (("id_carrera" IS NULL) <> ("facultad" IS NULL))
);

CREATE UNIQUE INDEX "alcance_coordinador_id_usuario_id_carrera_key" ON "alcance_coordinador"("id_usuario", "id_carrera");

CREATE UNIQUE INDEX "alcance_coordinador_id_usuario_facultad_key" ON "alcance_coordinador"("id_usuario", "facultad");

CREATE INDEX "alcance_coordinador_id_carrera_idx" ON "alcance_coordinador"("id_carrera");

ALTER TABLE "alcance_coordinador" ADD CONSTRAINT "alcance_coordinador_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "alcance_coordinador" ADD CONSTRAINT "alcance_coordinador_id_carrera_fkey" FOREIGN KEY ("id_carrera") REFERENCES "carrera"("id_carrera") ON DELETE RESTRICT ON UPDATE CASCADE;
