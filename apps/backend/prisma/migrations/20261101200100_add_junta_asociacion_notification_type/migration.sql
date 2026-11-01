-- ASO: aviso al usuario cuando el admin lo nombra, cambia o quita de una junta.
-- Aditiva: un valor al final del enum, sin reordenar los existentes.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'JUNTA_ASOCIACION';
