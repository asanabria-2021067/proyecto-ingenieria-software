-- A7.1: garantiza a lo sumo una fila de HorasParticipacion por
-- (id_participacion, id_sprint) cuando id_sprint NO es NULL — sin esto, un
-- futuro endpoint de ajuste identificado por projectId+sprintId+
-- participationId no puede determinar de forma inequívoca qué fila
-- actualizar (auditoría A7 original, sección "IDENTIDAD AMBIGUA").
--
-- Índice único PARCIAL (mismo patrón ya usado por
-- participacion_proyecto_activa_unique, asignacion_tarea_activa_unique,
-- solicitud_salida_proyecto_pendiente_unique y sprint_operable_unique):
-- WHERE id_sprint IS NOT NULL preserva intacta la semántica histórica de
-- ParticipacionProyecto 1:N HorasParticipacion para los registros
-- periódicos/legacy con id_sprint = NULL, que siguen sin ninguna
-- restricción de unicidad. Sin backfill, sin columnas nuevas, sin tocar
-- datos existentes: verificado antes de esta migración que no existían
-- pares (id_participacion, id_sprint no-null) duplicados.
CREATE UNIQUE INDEX "horas_participacion_sprint_unique"
ON "horas_participacion" ("id_participacion", "id_sprint")
WHERE "id_sprint" IS NOT NULL;
