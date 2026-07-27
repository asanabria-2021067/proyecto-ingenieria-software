-- Enforce at most one active assignment (desasignada_en IS NULL) per task,
-- while preserving unlimited closed historical rows and allowing a user to
-- be reassigned to the same task later.
CREATE UNIQUE INDEX "asignacion_tarea_activa_unique"
ON "asignacion_tarea" ("id_tarea")
WHERE "desasignada_en" IS NULL;
