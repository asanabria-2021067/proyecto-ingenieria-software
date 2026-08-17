-- FND-03: cierra la transición de compatibilidad de FND-01/FND-02. En este
-- punto todas las tareas legacy ya deberían estar asociadas a un Sprint
-- (backfill de FND-02), así que tarea.id_sprint pasa de opcional a
-- obligatorio, igual que su contraparte en schema.prisma (Tarea.idSprint
-- Int?  ->  Int, Tarea.sprint Sprint? -> Sprint).
--
-- Guard-rail: si por alguna razón todavía queda una tarea con id_sprint
-- NULL (lo que indicaría que la precondición de FND-02 no se cumplió), esta
-- migración ABORTA explícitamente antes de tocar el schema. FND-03 no hace
-- backfill: reparar huérfanos es responsabilidad de FND-02, no de esta
-- migración.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "tarea" WHERE "id_sprint" IS NULL
    ) THEN
        RAISE EXCEPTION
            'FND-03: no se puede aplicar NOT NULL sobre tarea.id_sprint porque todavía existen tareas sin Sprint asociado (id_sprint IS NULL). Esto indica que la precondición de FND-02 (backfill de Sprint 1 sintético) no se cumplió. Abortando — no se hace backfill en FND-03.';
    END IF;
END $$;

-- AlterTable
ALTER TABLE "tarea"
ALTER COLUMN "id_sprint" SET NOT NULL;

-- La FK creada en FND-01 (20260815000100_add_id_sprint_to_tarea) usaba
-- ON DELETE SET NULL, coherente con una columna opcional. Con id_sprint
-- ahora obligatorio, SET NULL ya no es una acción referencial válida
-- semánticamente (dejaría tareas con una FK NOT NULL en NULL). Se
-- reemplaza por ON DELETE RESTRICT ON UPDATE CASCADE, la misma acción que
-- usa el resto de relaciones padre-hijo obligatorias del schema (p. ej.
-- tarea_id_proyecto_fkey, tarea_creada_por_fkey): un Sprint con tareas
-- asociadas no puede borrarse dejando tareas huérfanas.
ALTER TABLE "tarea" DROP CONSTRAINT "tarea_id_sprint_fkey";

ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_sprint_fkey"
    FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint")
    ON DELETE RESTRICT ON UPDATE CASCADE;
