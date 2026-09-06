-- S7 M3 `s7_task_hour_adjustments` (06 v2 §37; §35 modelo AjusteHoraTarea;
-- §36 CK06…CK09 y s7_ajuste_vigente; §11 ajuste append-only por tramo).
--
-- Crea ajuste_hora_tarea anclada al tramo de asignación con FK a asignación,
-- autor, anulador y ajuste anterior (todas RESTRICT al borrar, CASCADE al
-- actualizar), UNIQUE de cadena sobre id_ajuste_anterior, índices
-- [id_asignacion, anulado_en] e [id_autor], los CHECK que mantienen la
-- propuesta no negativa, el delta justificado, la anulación coherente y la
-- cadena sin autorreferencia, y el índice parcial que permite a lo sumo un
-- ajuste vigente por tramo. Tabla nueva y vacía: todos los constraints nacen
-- validados; no se fabrica ningún ajuste histórico. Depende de M1/M2.

-- CreateTable
CREATE TABLE "ajuste_hora_tarea" (
    "id_ajuste_hora" SERIAL NOT NULL,
    "id_asignacion" INTEGER NOT NULL,
    "delta_horas" DECIMAL(12,2) NOT NULL,
    "horas_base" DECIMAL(12,2) NOT NULL,
    "justificacion" TEXT,
    "id_autor" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMP(3),
    "anulado_por" INTEGER,
    "id_ajuste_anterior" INTEGER,

    CONSTRAINT "ajuste_hora_tarea_pkey" PRIMARY KEY ("id_ajuste_hora")
);

-- CreateIndex
CREATE UNIQUE INDEX "ajuste_hora_tarea_id_ajuste_anterior_key" ON "ajuste_hora_tarea"("id_ajuste_anterior");

-- CreateIndex
CREATE INDEX "ajuste_hora_tarea_id_asignacion_anulado_en_idx" ON "ajuste_hora_tarea"("id_asignacion", "anulado_en");

-- CreateIndex
CREATE INDEX "ajuste_hora_tarea_id_autor_idx" ON "ajuste_hora_tarea"("id_autor");

-- AddForeignKey
ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "ajuste_hora_tarea_id_asignacion_fkey" FOREIGN KEY ("id_asignacion") REFERENCES "asignacion_tarea"("id_asignacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "ajuste_hora_tarea_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "ajuste_hora_tarea_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "ajuste_hora_tarea_id_ajuste_anterior_fkey" FOREIGN KEY ("id_ajuste_anterior") REFERENCES "ajuste_hora_tarea"("id_ajuste_hora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- S7 §36: CHECK manuales (tabla nueva, validados desde su creación).
ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "s7_ck_06"
  CHECK ("horas_base" >= 0 AND "horas_base" + "delta_horas" >= 0);

ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "s7_ck_07"
  CHECK ("delta_horas" = 0 OR ("justificacion" IS NOT NULL AND btrim("justificacion") <> ''));

ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "s7_ck_08"
  CHECK (("anulado_en" IS NULL) = ("anulado_por" IS NULL));

ALTER TABLE "ajuste_hora_tarea" ADD CONSTRAINT "s7_ck_09"
  CHECK ("id_ajuste_anterior" IS NULL OR "id_ajuste_anterior" <> "id_ajuste_hora");

-- S7 §36: a lo sumo un ajuste vigente (anulado_en IS NULL) por tramo.
CREATE UNIQUE INDEX "s7_ajuste_vigente"
  ON "ajuste_hora_tarea" ("id_asignacion")
  WHERE "anulado_en" IS NULL;
