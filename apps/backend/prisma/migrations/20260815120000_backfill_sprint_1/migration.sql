-- Backfill FND-02: crea el Sprint 1 sintético para todo proyecto que tenga
-- tareas legacy sin sprint (id_sprint IS NULL) y asocia esas tareas al
-- Sprint resuelto. No aplica NOT NULL sobre tarea.id_sprint (eso es FND-03)
-- ni reasigna/sobrescribe tareas que ya tuvieran id_sprint poblado.
--
-- Idempotencia: "proyectos_objetivo" solo incluye proyectos con al menos una
-- tarea id_sprint IS NULL, evaluado en el momento de ejecución. "a_crear"
-- excluye explícitamente los proyectos que ya tienen un Sprint numero = 1
-- (creado por una corrida anterior de este backfill o manualmente), así que
-- una segunda ejecución de esta lógica nunca duplica el Sprint 1: o bien no
-- quedan tareas huérfanas (proyectos_objetivo vacío) o el proyecto ya tiene
-- su Sprint 1 y solo se reutiliza su id para el UPDATE. Los Sprints
-- existentes nunca se borran, sobrescriben ni renumeran.
--
-- Mapeo estado_proyecto -> estado del Sprint 1 sintético (contrato FND-02):
--   EN_PROGRESO, EN_SOLICITUD_CIERRE -> ACTIVO   (trabajo previo vigente)
--   CERRADO, CANCELADO               -> CERRADO  (nunca operable)
-- Antes de marcar un Sprint 1 como ACTIVO se verifica que el proyecto no
-- tenga ya otro Sprint operable (ACTIVO/EN_FINALIZACION) con otro número;
-- si ya lo tiene, el Sprint 1 sintético se crea CERRADO para no violar
-- `sprint_operable_unique` (edge case defensivo; no se observó en los datos
-- locales, donde sprintsExistentes = 0 antes de este backfill).
--
-- Estados de EstadoProyecto NO cubiertos explícitamente por el contrato
-- (BORRADOR, EN_REVISION, OBSERVADO, PUBLICADO) sí aparecen con tareas
-- legacy reales en los datos observados localmente (proyectos en PUBLICADO,
-- OBSERVADO y CANCELADO con tareas al momento de escribir esta migración).
-- Ante la ambigüedad del contrato para esos estados, y para no arriesgar
-- que un proyecto que el contrato no autorizó explícitamente como "en
-- curso" quede con un Sprint operable, se tratan conservadoramente como
-- CERRADO igual que CERRADO/CANCELADO. Esta es una decisión documentada,
-- no silenciosa: requiere confirmación de negocio explícita (ver auditoría
-- FND-02) antes de asumirse como tratamiento definitivo.
--
-- Fechas: fecha_inicio usa proyecto.fecha_inicio si existe, si no
-- proyecto.fecha_creacion (siempre NOT NULL). fecha_cierre (solo para
-- Sprints CERRADO) usa proyecto.fecha_actualizacion si existe, si no
-- proyecto.fecha_creacion — mismo proxy "fecha_actualizacion como fecha de
-- cierre" ya usado en admin.service.ts (proyectosCerrados2026). No se usa
-- NOW() en ningún caso: siempre hay una fecha legacy derivable porque
-- fecha_creacion es obligatoria.

WITH proyectos_objetivo AS (
    SELECT DISTINCT
        p.id_proyecto,
        p.estado_proyecto,
        p.fecha_inicio,
        p.fecha_actualizacion,
        p.fecha_creacion
    FROM "proyecto" p
    JOIN "tarea" t ON t.id_proyecto = p.id_proyecto
    WHERE t.id_sprint IS NULL
),
a_crear AS (
    SELECT po.*
    FROM proyectos_objetivo po
    WHERE NOT EXISTS (
        SELECT 1 FROM "sprint" s
        WHERE s.id_proyecto = po.id_proyecto AND s.numero = 1
    )
),
nuevos_sprints AS (
    INSERT INTO "sprint" (id_proyecto, numero, estado, fecha_inicio, fecha_cierre)
    SELECT
        ac.id_proyecto,
        1,
        CASE
            WHEN ac.estado_proyecto IN ('EN_PROGRESO', 'EN_SOLICITUD_CIERRE')
                 AND NOT EXISTS (
                     SELECT 1 FROM "sprint" s2
                     WHERE s2.id_proyecto = ac.id_proyecto
                       AND s2.estado IN ('ACTIVO', 'EN_FINALIZACION')
                 )
            THEN 'ACTIVO'::"EstadoSprint"
            ELSE 'CERRADO'::"EstadoSprint"
        END AS estado,
        COALESCE(ac.fecha_inicio, ac.fecha_creacion) AS fecha_inicio,
        CASE
            WHEN ac.estado_proyecto IN ('EN_PROGRESO', 'EN_SOLICITUD_CIERRE')
                 AND NOT EXISTS (
                     SELECT 1 FROM "sprint" s2
                     WHERE s2.id_proyecto = ac.id_proyecto
                       AND s2.estado IN ('ACTIVO', 'EN_FINALIZACION')
                 )
            THEN NULL
            ELSE COALESCE(ac.fecha_actualizacion, ac.fecha_creacion)
        END AS fecha_cierre
    FROM a_crear ac
    RETURNING id_sprint, id_proyecto
),
sprint_resuelto AS (
    SELECT id_proyecto, id_sprint FROM nuevos_sprints
    UNION ALL
    SELECT s.id_proyecto, s.id_sprint
    FROM "sprint" s
    JOIN proyectos_objetivo po ON po.id_proyecto = s.id_proyecto
    WHERE s.numero = 1
)
UPDATE "tarea" t
SET id_sprint = sr.id_sprint
FROM sprint_resuelto sr
WHERE t.id_proyecto = sr.id_proyecto
  AND t.id_sprint IS NULL;
