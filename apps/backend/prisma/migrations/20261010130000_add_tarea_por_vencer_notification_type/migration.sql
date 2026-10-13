-- HU-186 (T-330): un único valor nuevo del enum TipoNotificacion para el
-- recordatorio de tareas próximas a vencer. Migración aislada y ADITIVA: no
-- crea filas, no toca columnas ni tablas.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'TAREA_POR_VENCER';
