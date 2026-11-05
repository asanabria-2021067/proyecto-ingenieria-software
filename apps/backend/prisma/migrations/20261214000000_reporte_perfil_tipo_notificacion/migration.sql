-- MEJ-154: tipo propio para el aviso a administradores de un reporte de perfil. Solo aditivo.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'REPORTE_PERFIL';
