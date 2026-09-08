-- S7 M6 `s7_notification_types` (06 v2 §37; §44 ocho valores exactos; §48
-- M6 antes de cualquier emisor de Sprint 7, incluido el cierre de Sprint).
--
-- Añade ocho valores al enum TipoNotificacion existente (liderazgo, cierre,
-- consolidación y acreditación). Solo valores: los treinta literales
-- existentes conservan identidad y orden, no se crea ningún enum ni tabla
-- nueva, ninguna plantilla ni emisor se conecta aquí y no se inserta
-- ninguna notificación. ADD VALUE IF NOT EXISTS es idempotente; en
-- PostgreSQL 12+ puede ejecutarse dentro de la transacción de la migración
-- (los valores nuevos no se usan en esa misma transacción).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'APELACION_LIDERAZGO_RECIBIDA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'APELACION_LIDERAZGO_RESUELTA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'LIDERAZGO_ACTUALIZADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'POSTULACION_RECHAZADA_POR_CIERRE';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CIERRE_CORRECCION_DOCUMENTAL';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CIERRE_DEVUELTO_A_EJECUCION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'HORAS_CONSOLIDADAS';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'HORAS_ACREDITADAS';
