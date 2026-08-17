-- FND-06 (segunda migración, de dos): añade el contexto opcional de
-- participación a AsignacionTarea y hace un backfill de MEJOR ESFUERZO
-- exclusivamente sobre tramos activos (desasignada_en IS NULL). Los tramos
-- cerrados legacy permanecen id_participacion = NULL deliberadamente: FND-06
-- no reconstruye retroactivamente todo el historial.

-- AlterTable
-- id_participacion es NULLABLE: no se convierte en NOT NULL en ningún punto
-- de esta migración ni de FND-06 en general.
ALTER TABLE "asignacion_tarea" ADD COLUMN "id_participacion" INTEGER;

-- CreateIndex
CREATE INDEX "asignacion_tarea_id_participacion_idx" ON "asignacion_tarea"("id_participacion");

-- AddForeignKey
-- ON DELETE SET NULL: idParticipacion es contexto histórico opcional: si la
-- ParticipacionProyecto referenciada se elimina, la asignación (y su tramo)
-- deben seguir existiendo — nunca se borra una AsignacionTarea como efecto
-- colateral de borrar una participación. Mismo patrón que Tarea.rolProyecto
-- (FK opcional -> SetNull) ya usado en este schema.
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "asignacion_tarea_id_participacion_fkey" FOREIGN KEY ("id_participacion") REFERENCES "participacion_proyecto"("id_participacion") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill de mejor esfuerzo, solo tramos activos legacy.
--
-- "activas": candidatos a backfill. Filtra:
--   - desasignada_en IS NULL       (SOLO tramos activos; los cerrados nunca
--                                    se tocan, ver Sección 18/22 de la tarea)
--   - id_participacion IS NULL     (idempotencia: una fila ya poblada por una
--                                    corrida anterior de este mismo backfill
--                                    nunca se reevalúa ni se sobrescribe)
--   - t.id_rol_proyecto IS NOT NULL (sin rol en la tarea no hay forma de
--                                    resolver una ParticipacionProyecto
--                                    compatible; queda NULL por diseño)
--
-- "candidatos": une con ParticipacionProyecto exigiendo SIMULTÁNEAMENTE
-- mismo usuario + mismo rol de proyecto + estado ACTIVO, y además une
-- explícitamente con RolProyecto para verificar el mismo id_proyecto que la
-- Tarea de la asignación (protección cross-project explícita, aunque
-- rol_proyecto ya fija un único proyecto por construcción). n_candidatos
-- cuenta cuántas participaciones compatibles existen por asignación.
--
-- "resueltos": solo pasan las asignaciones con EXACTAMENTE 1 candidato
-- (n_candidatos = 1). Con 0 candidatos o más de 1, id_participacion
-- permanece NULL — nunca se elige arbitrariamente (no se usa LIMIT/ORDER
-- BY/MIN/MAX para desempatar).
WITH activas AS (
    SELECT
        at.id_asignacion,
        at.id_usuario,
        t.id_proyecto,
        t.id_rol_proyecto
    FROM "asignacion_tarea" at
    JOIN "tarea" t ON t.id_tarea = at.id_tarea
    WHERE at.desasignada_en IS NULL
      AND at.id_participacion IS NULL
      AND t.id_rol_proyecto IS NOT NULL
),
candidatos AS (
    SELECT
        a.id_asignacion,
        pp.id_participacion,
        COUNT(*) OVER (PARTITION BY a.id_asignacion) AS n_candidatos
    FROM activas a
    JOIN "participacion_proyecto" pp
      ON pp.id_usuario = a.id_usuario
     AND pp.id_rol_proyecto = a.id_rol_proyecto
     AND pp.estado_participacion = 'ACTIVO'
    JOIN "rol_proyecto" rp
      ON rp.id_rol_proyecto = a.id_rol_proyecto
     AND rp.id_proyecto = a.id_proyecto
),
resueltos AS (
    SELECT id_asignacion, id_participacion
    FROM candidatos
    WHERE n_candidatos = 1
)
UPDATE "asignacion_tarea" at
SET id_participacion = r.id_participacion
FROM resueltos r
WHERE at.id_asignacion = r.id_asignacion;
