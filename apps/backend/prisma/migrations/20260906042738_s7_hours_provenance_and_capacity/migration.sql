-- S7 M1 `s7_hours_provenance_and_capacity` (06 v2 §37; §35 delta de
-- AsignacionTarea y HorasParticipacion; §8 capacidad Decimal(12,2); §36
-- CK04/CK05/CK31; §14 clasificación de procedencia).
--
-- Añade la procedencia del importe de cada tramo (origen_reporte, default
-- GRANULAR = comportamiento vigente), amplía la caché del tramo y los tres
-- agregados de horas_participacion a numeric(12,2) para que muchas entradas
-- Decimal(6,2) puedan sumar por encima del límite de una entrada, hace
-- explícitas las acciones referenciales (participación del tramo, Sprint y
-- aprobador del agregado: RESTRICT al borrar, CASCADE al actualizar) y crea
-- el índice [origen_reporte, reconocido_en]. Sin backfill y sin writer: la
-- clasificación real de tramos históricos es tarea de la herramienta de
-- conciliación D1. Los CHECK entran NOT VALID sobre tablas pobladas para
-- identificar filas históricas sin borrarlas; VALIDATE CONSTRAINT queda
-- como precondición posterior a la conciliación.

-- CreateEnum
CREATE TYPE "OrigenReporteTramo" AS ENUM ('GRANULAR', 'LEGACY', 'POR_CONCILIAR');

-- DropForeignKey
ALTER TABLE "asignacion_tarea" DROP CONSTRAINT "asignacion_tarea_id_participacion_fkey";

-- DropForeignKey
ALTER TABLE "horas_participacion" DROP CONSTRAINT "horas_participacion_aprobado_por_fkey";

-- DropForeignKey
ALTER TABLE "horas_participacion" DROP CONSTRAINT "horas_participacion_id_sprint_fkey";

-- AlterTable
ALTER TABLE "asignacion_tarea" ADD COLUMN     "origen_reporte" "OrigenReporteTramo" NOT NULL DEFAULT 'GRANULAR',
ALTER COLUMN "horas_reales" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "horas_participacion" ALTER COLUMN "horas_reportadas" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "horas_aprobadas" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "horas_calculadas" SET DATA TYPE DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "asignacion_tarea_origen_reporte_reconocido_en_idx" ON "asignacion_tarea"("origen_reporte", "reconocido_en");

-- AddForeignKey
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "asignacion_tarea_id_participacion_fkey" FOREIGN KEY ("id_participacion") REFERENCES "participacion_proyecto"("id_participacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horas_participacion" ADD CONSTRAINT "horas_participacion_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horas_participacion" ADD CONSTRAINT "horas_participacion_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE RESTRICT ON UPDATE CASCADE;

-- S7 §36: CHECK manuales sobre tablas existentes, NOT VALID (ver cabecera).
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "s7_ck_04"
  CHECK ("horas_reales" IS NULL OR "horas_reales" >= 0) NOT VALID;

ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "s7_ck_05"
  CHECK ("origen_reporte" <> 'LEGACY' OR "horas_reales" IS NOT NULL) NOT VALID;

ALTER TABLE "horas_participacion" ADD CONSTRAINT "s7_ck_31"
  CHECK (
    "horas_reportadas" >= 0
    AND ("horas_calculadas" IS NULL OR "horas_calculadas" >= 0)
    AND ("horas_aprobadas" IS NULL OR "horas_aprobadas" >= 0)
  ) NOT VALID;
