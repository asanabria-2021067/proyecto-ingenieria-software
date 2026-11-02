-- MEJ-54 y MEJ-57: dos valores nuevos del enum TipoNotificacion. Migracion aislada y ADITIVA.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'HITO_ATRASADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'RECONOCIMIENTO_RECIBIDO';
