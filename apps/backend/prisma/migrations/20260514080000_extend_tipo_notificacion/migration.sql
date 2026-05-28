-- Extend TipoNotificacion enum with new values used by notifications and seed data
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'NUEVA_POSTULACION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CAMBIO_ESTADO_PROYECTO';
