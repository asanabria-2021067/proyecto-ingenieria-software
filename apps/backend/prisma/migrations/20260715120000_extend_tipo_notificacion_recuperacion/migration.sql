-- Extend TipoNotificacion enum for admin-facing password recovery request notice
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOLICITUD_RECUPERACION_CONTRASENA';
