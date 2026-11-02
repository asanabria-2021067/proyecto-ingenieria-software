-- MEJ-13/60: avisos de horas en riesgo y recordatorio de registrar horas. Valores nuevos al final del enum.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'HORAS_EN_RIESGO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'RECORDATORIO_HORAS';
