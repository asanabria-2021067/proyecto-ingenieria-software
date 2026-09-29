-- Dock global de chat: silenciar, prioridad manual y borrado (soft-delete).
-- Migración aditiva: columnas nullable / con default, no toca filas existentes.
ALTER TABLE "conversacion" ADD COLUMN "silenciada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversacion" ADD COLUMN "es_prioritaria" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "conversacion" ADD COLUMN "eliminada_en" TIMESTAMP(3);
