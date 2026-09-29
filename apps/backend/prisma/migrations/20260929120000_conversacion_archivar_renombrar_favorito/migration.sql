-- Menú de 3 puntos del chat de proyecto: archivar, renombrar, favorito.
-- Migración aditiva: columnas nullable / con default, no toca filas existentes.
ALTER TABLE "conversacion" ADD COLUMN "nombre_personalizado" VARCHAR(120);
ALTER TABLE "conversacion" ADD COLUMN "es_favorita" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversacion" ADD COLUMN "archivada_en" TIMESTAMP(3);
