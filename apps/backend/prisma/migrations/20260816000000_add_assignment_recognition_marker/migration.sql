-- FND-09 (A5.1): añade el marcador persistente de reconocimiento de horas
-- que A5/A6/B10/A9 necesitan para evitar reconocer dos veces el mismo tramo
-- de AsignacionTarea. NULL = tramo todavía reconocible; NOT NULL = tramo ya
-- consumido por un proceso de reconocimiento. Migración exclusivamente
-- aditiva, sin DEFAULT y sin backfill: todas las filas existentes quedan
-- reconocido_en = NULL porque no existe hoy ningún reconocimiento granular
-- implementado capaz de demostrar que un tramo histórico ya fue consumido
-- (HorasParticipacion es un agregado por período/Sprint, sin relación hacia
-- AsignacionTarea individuales).

-- AlterTable
ALTER TABLE "asignacion_tarea" ADD COLUMN "reconocido_en" TIMESTAMP(3);
