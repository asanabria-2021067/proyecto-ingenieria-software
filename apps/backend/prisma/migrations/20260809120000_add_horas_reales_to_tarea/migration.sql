-- Horas reales trabajadas en la tarea (nullable): reportadas manualmente por
-- el líder al editarla, distintas de tiempo_estimado_horas (estimado) y de
-- horas_participacion (horas por participación/periodo, no por tarea).
ALTER TABLE "tarea" ADD COLUMN "horas_reales" DECIMAL(6,2);
