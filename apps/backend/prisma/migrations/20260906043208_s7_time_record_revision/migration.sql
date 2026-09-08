-- S7 M2 `s7_time_record_revision` (06 v2 §37; §35 modelo RegistroTiempoTarea;
-- §36 CK01/CK02/CK03; §9 edición y revocación).
--
-- Añade a registro_tiempo_tarea la justificación de exceso, la marca de
-- edición y el par de revocación (fecha + revocador con FK RESTRICT/CASCADE
-- a usuario), más el índice de registros efectivos [id_asignacion,
-- revocado_en]. Sin backfill: todo registro histórico queda efectivo y sin
-- editar (los cuatro campos en NULL). CK01 (horas > 0) entra NOT VALID
-- porque la tabla ya está poblada y el diagnóstico de horas <= 0 precede a
-- su VALIDATE CONSTRAINT; CK02 y CK03 nacen validados porque los campos que
-- restringen nacen vacíos. Depende de M1.

-- AlterTable
ALTER TABLE "registro_tiempo_tarea" ADD COLUMN     "editado_en" TIMESTAMP(3),
ADD COLUMN     "justificacion_exceso" TEXT,
ADD COLUMN     "revocado_en" TIMESTAMP(3),
ADD COLUMN     "revocado_por" INTEGER;

-- CreateIndex
CREATE INDEX "registro_tiempo_tarea_id_asignacion_revocado_en_idx" ON "registro_tiempo_tarea"("id_asignacion", "revocado_en");

-- AddForeignKey
ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "registro_tiempo_tarea_revocado_por_fkey" FOREIGN KEY ("revocado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- S7 §36: CHECK manuales. CK01 NOT VALID (tabla poblada, ver cabecera);
-- CK02/CK03 validados porque las columnas de revocación nacen en NULL.
ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "s7_ck_01"
  CHECK ("horas" > 0) NOT VALID;

ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "s7_ck_02"
  CHECK (("revocado_en" IS NULL) = ("revocado_por" IS NULL));

ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "s7_ck_03"
  CHECK ("revocado_por" IS NULL OR "revocado_por" = "id_usuario");
