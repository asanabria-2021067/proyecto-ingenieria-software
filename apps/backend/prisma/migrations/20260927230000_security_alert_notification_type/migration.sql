-- G05-C11 (OWASP25-C038): un único valor nuevo del enum TipoNotificacion para
-- las alertas de seguridad a administradores. Migración aislada y ADITIVA: no
-- crea filas, no toca columnas ni tablas. Las alertas se emiten solo con
-- SECURITY_ALERTS_ENABLED=true (G05-C12, default false).
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ALERTA_SEGURIDAD';
