-- Corrección FND-02.B: la migración 20260815120000_backfill_sprint_1 trató
-- conservadoramente los proyectos legacy en estados no explícitamente
-- cubiertos por el contrato original (BORRADOR, EN_REVISION, OBSERVADO,
-- PUBLICADO) creando su Sprint 1 sintético como CERRADO. El contrato real
-- del Plan Maestro es que TODO proyecto legacy que no esté CERRADO/CANCELADO
-- debe terminar con su Sprint 1 de compatibilidad ACTIVO — este backfill es
-- exclusivamente compatibilidad retroactiva para proyectos que ya tenían
-- tareas antes de que existiera Sprint; no cambia el flujo futuro (un
-- proyecto nuevo no crea Sprint automáticamente, y el primer Sprint futuro
-- lo inicia el líder manualmente).
--
-- Alcance: exclusivamente Sprint.numero = 1 de proyectos con al menos una
-- tarea (el universo exacto que tocó el backfill original). No toca
-- Sprint.numero != 1 (sprints históricos reales quedan intactos) ni
-- proyectos CERRADO/CANCELADO (cuyo Sprint 1 debe permanecer CERRADO).
--
-- Guard de seguridad: si un proyecto que necesita su Sprint 1 en ACTIVO ya
-- tiene otro Sprint operable (ACTIVO/EN_FINALIZACION) con distinto numero
-- —estado inconsistente que sprint_operable_unique jamás debería permitir
-- resolver silenciosamente—, la migración ABORTA explícitamente con
-- RAISE EXCEPTION en lugar de elegir un fallback arbitrario. No se observó
-- este caso en la base local (ver auditoría FND-02.B), pero el guard cubre
-- el escenario para cualquier entorno donde sí ocurra.
DO $$
DECLARE
    conflicto RECORD;
BEGIN
    SELECT s1.id_proyecto AS id_proyecto,
           s1.id_sprint   AS id_sprint_1,
           s2.id_sprint   AS id_sprint_conflicto,
           s2.numero      AS numero_conflicto
    INTO conflicto
    FROM "sprint" s1
    JOIN "proyecto" p ON p.id_proyecto = s1.id_proyecto
    JOIN "sprint" s2 ON s2.id_proyecto = s1.id_proyecto
                     AND s2.numero <> 1
                     AND s2.estado IN ('ACTIVO', 'EN_FINALIZACION')
    WHERE s1.numero = 1
      AND s1.estado <> 'ACTIVO'
      AND p.estado_proyecto NOT IN ('CERRADO', 'CANCELADO')
      AND EXISTS (SELECT 1 FROM "tarea" t WHERE t.id_proyecto = p.id_proyecto)
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'FND-02.B: el proyecto % tiene Sprint 1 (id_sprint=%) pendiente de corregir a ACTIVO, pero ya posee otro Sprint operable (id_sprint=%, numero=%). Estado inconsistente — abortando la corrección en lugar de elegir un fallback silencioso; requiere resolución manual antes de reintentar.',
            conflicto.id_proyecto, conflicto.id_sprint_1, conflicto.id_sprint_conflicto, conflicto.numero_conflicto;
    END IF;
END $$;

-- Corrige Sprint 1 de proyectos legacy no cerrados/cancelados: debe quedar
-- ACTIVO y sin fecha_cierre. Idempotente: en una segunda evaluación
-- "estado <> 'ACTIVO'" ya no selecciona ninguna fila.
UPDATE "sprint" s
SET estado = 'ACTIVO',
    fecha_cierre = NULL
FROM "proyecto" p
WHERE s.id_proyecto = p.id_proyecto
  AND s.numero = 1
  AND s.estado <> 'ACTIVO'
  AND p.estado_proyecto NOT IN ('CERRADO', 'CANCELADO')
  AND EXISTS (SELECT 1 FROM "tarea" t WHERE t.id_proyecto = p.id_proyecto);
