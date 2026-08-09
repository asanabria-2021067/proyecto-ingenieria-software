-- Enforce at most one ACTIVO participation per (usuario, rol_proyecto), while
-- preserving unlimited historical rows (RETIRADO/COMPLETADO) so a user can
-- leave a role and rejoin it later (Secciones 6, 7, 11). Mirrors the partial
-- unique index pattern already used by asignacion_tarea_activa_unique.

-- Backfill (deterministic, non-destructive): if any (usuario, rol) currently
-- holds more than one ACTIVO participation, keep the earliest one
-- (lowest id_participacion) ACTIVO and demote the rest to RETIRADO. No rows are
-- deleted; fecha_salida is stamped only when it was NULL.
WITH activas_duplicadas AS (
    SELECT
        id_participacion,
        ROW_NUMBER() OVER (
            PARTITION BY id_usuario, id_rol_proyecto
            ORDER BY id_participacion ASC
        ) AS orden
    FROM "participacion_proyecto"
    WHERE estado_participacion = 'ACTIVO'
)
UPDATE "participacion_proyecto" AS participacion
SET estado_participacion = 'RETIRADO',
    fecha_salida = COALESCE(participacion.fecha_salida, CURRENT_DATE)
FROM activas_duplicadas
WHERE participacion.id_participacion = activas_duplicadas.id_participacion
  AND activas_duplicadas.orden > 1;

-- Partial unique index: only ACTIVO rows are constrained, so the historical
-- rows demoted above (and any future RETIRADO/COMPLETADO) never collide. A
-- concurrent double self-assign therefore fails with a unique violation, which
-- the service layer translates to 409 Conflict.
CREATE UNIQUE INDEX "participacion_proyecto_activa_unique"
ON "participacion_proyecto" ("id_usuario", "id_rol_proyecto")
WHERE "estado_participacion" = 'ACTIVO';
