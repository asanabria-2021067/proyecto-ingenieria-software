-- Horas reales trabajadas por idUsuario durante ESTE tramo concreto de
-- asignación (nullable): fuente granular por reasignación, nunca un total
-- único por tarea. Ver comentario del modelo AsignacionTarea en schema.prisma.
ALTER TABLE "asignacion_tarea" ADD COLUMN "horas_reales" DECIMAL(6,2);
