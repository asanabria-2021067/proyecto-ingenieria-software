-- T-291 (HU-176): índices para las cinco secciones más lentas de la medición
-- base (docs/qa/sprint9/secciones-lentas.md). Solo crea índices; no toca
-- tablas ni datos.

-- GET /admin/estadisticas: los count de usuarios filtran por estado y, para
-- nuevosInactivos2026, también por fecha_creacion.
-- CreateIndex
CREATE INDEX "usuario_estado_fecha_creacion_idx" ON "usuario"("estado", "fecha_creacion");

-- GET /admin/estadisticas: los count de proyectos filtran por estado_proyecto
-- y eliminado_en IS NULL.
-- CreateIndex
CREATE INDEX "proyecto_estado_proyecto_eliminado_en_idx" ON "proyecto"("estado_proyecto", "eliminado_en");

-- GET /proyectos/:id: roles e hitos del detalle se cargan por id_proyecto, y
-- Postgres no indexa las claves foráneas por su cuenta.
-- CreateIndex
CREATE INDEX "rol_proyecto_id_proyecto_idx" ON "rol_proyecto"("id_proyecto");

-- CreateIndex
CREATE INDEX "hito_id_proyecto_idx" ON "hito"("id_proyecto");

-- GET /proyectos/:id/sprints/:sprintId: trae todos los tramos de asignación
-- de las tareas (no solo el activo), así que el índice parcial
-- asignacion_tarea_activa_unique (WHERE desasignada_en IS NULL) no aplica.
-- CreateIndex
CREATE INDEX "asignacion_tarea_id_tarea_idx" ON "asignacion_tarea"("id_tarea");

-- GET /admin/estadisticas: suma las horas aprobadas por participación. El
-- índice parcial horas_participacion_sprint_unique excluye las filas sin
-- id_sprint (horas por asistencia), así que no cubre este filtro.
-- CreateIndex
CREATE INDEX "horas_participacion_id_participacion_idx" ON "horas_participacion"("id_participacion");

-- Tablero, detalle de Sprint y detalle de proyecto: cuentan o listan los
-- comentarios de cada tarea por id_tarea; comentario no tenía ningún índice.
-- CreateIndex
CREATE INDEX "comentario_id_tarea_idx" ON "comentario"("id_tarea");
