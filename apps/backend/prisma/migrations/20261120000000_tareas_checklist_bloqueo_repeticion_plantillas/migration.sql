-- MEJ-6, 47, 48, 52: checklist, tareas repetitivas, bloqueo entre tareas y plantillas.

-- CreateEnum
CREATE TYPE "RepeticionTarea" AS ENUM ('DIARIA', 'SEMANAL', 'MENSUAL');

-- AlterTable
ALTER TABLE "tarea" ADD COLUMN "id_tarea_bloqueante" INTEGER,
	ADD COLUMN "repeticion" "RepeticionTarea",
	ADD COLUMN "repeticion_proxima" DATE,
	ADD COLUMN "id_tarea_origen" INTEGER;

-- CreateTable
CREATE TABLE "tarea_checklist_item" (
	"id_item" SERIAL NOT NULL,
	"id_tarea" INTEGER NOT NULL,
	"texto" VARCHAR(200) NOT NULL,
	"completado" BOOLEAN NOT NULL DEFAULT false,
	"orden" INTEGER NOT NULL DEFAULT 0,

	CONSTRAINT "tarea_checklist_item_pkey" PRIMARY KEY ("id_item")
);

-- CreateTable
CREATE TABLE "plantilla_tarea" (
	"id_plantilla" SERIAL NOT NULL,
	"id_proyecto" INTEGER NOT NULL,
	"nombre" VARCHAR(100) NOT NULL,
	"titulo_tarea" VARCHAR(150) NOT NULL,
	"descripcion_tarea" TEXT,
	"prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
	"tiempo_estimado_horas" INTEGER,
	"checklist" JSONB NOT NULL DEFAULT '[]',
	"creada_por" INTEGER NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "plantilla_tarea_pkey" PRIMARY KEY ("id_plantilla")
);

-- CreateIndex
CREATE INDEX "tarea_id_tarea_bloqueante_idx" ON "tarea"("id_tarea_bloqueante");

-- CreateIndex
CREATE INDEX "tarea_repeticion_proxima_idx" ON "tarea"("repeticion_proxima");

-- CreateIndex
CREATE INDEX "tarea_checklist_item_id_tarea_idx" ON "tarea_checklist_item"("id_tarea");

-- CreateIndex
CREATE INDEX "plantilla_tarea_id_proyecto_idx" ON "plantilla_tarea"("id_proyecto");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_tarea_bloqueante_fkey" FOREIGN KEY ("id_tarea_bloqueante") REFERENCES "tarea"("id_tarea") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_tarea_origen_fkey" FOREIGN KEY ("id_tarea_origen") REFERENCES "tarea"("id_tarea") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_checklist_item" ADD CONSTRAINT "tarea_checklist_item_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_tarea" ADD CONSTRAINT "plantilla_tarea_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una tarea no puede bloquearse a si misma
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_bloqueante_distinta_chk" CHECK ("id_tarea_bloqueante" IS NULL OR "id_tarea_bloqueante" <> "id_tarea");
