-- MEJ-88: cierre de la tarjeta Primeros pasos.
ALTER TABLE "usuario" ADD COLUMN "primeros_pasos_cerrados_en" TIMESTAMP(3);

-- MEJ-89: contenido de ejemplo del primer proyecto.
ALTER TABLE "sprint" ADD COLUMN "es_ejemplo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tarea" ADD COLUMN "es_ejemplo" BOOLEAN NOT NULL DEFAULT false;

-- MEJ-90: reportes de problemas.
CREATE TYPE "EstadoReporteProblema" AS ENUM ('PENDIENTE', 'ATENDIDO');

CREATE TABLE "reporte_problema" (
	"id_reporte" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"ruta" VARCHAR(300) NOT NULL,
	"user_agent" VARCHAR(300) NOT NULL,
	"descripcion" VARCHAR(2000) NOT NULL,
	"url_captura" VARCHAR(500),
	"estado" "EstadoReporteProblema" NOT NULL DEFAULT 'PENDIENTE',
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"atendido_en" TIMESTAMP(3),
	"atendido_por" INTEGER,
	CONSTRAINT "reporte_problema_pkey" PRIMARY KEY ("id_reporte")
);

CREATE INDEX "reporte_problema_estado_creado_en_idx" ON "reporte_problema"("estado", "creado_en");

ALTER TABLE "reporte_problema"
	ADD CONSTRAINT "reporte_problema_id_usuario_fkey"
	FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reporte_problema"
	ADD CONSTRAINT "reporte_problema_atendido_por_fkey"
	FOREIGN KEY ("atendido_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
