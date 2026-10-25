-- HU-195 (T-364): avisos del ciclo de vida de una reunión de Administración.
-- Aditiva: tres valores al final del enum, sin reordenar los existentes. Como
-- toda ampliación de enum en PostgreSQL, no se revierte con un DROP VALUE; sin
-- filas que los usen son inertes.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'REUNION_PROGRAMADA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'REUNION_ACTUALIZADA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'REUNION_CANCELADA';
