-- MEJ-66: anuncios de organizaciones (miembros) y de asociaciones (estudiantes de sus carreras).
-- Aditiva: los anuncios existentes quedan como globales (ambas columnas NULL).

-- AlterTable
ALTER TABLE "anuncio" ADD COLUMN "id_organizacion" INTEGER;
ALTER TABLE "anuncio" ADD COLUMN "id_asociacion" INTEGER;
ALTER TABLE "anuncio" ADD COLUMN "creado_por" INTEGER;

-- A lo mucho una entidad dueña por anuncio
ALTER TABLE "anuncio" ADD CONSTRAINT "anuncio_una_entidad_check" CHECK ("id_organizacion" IS NULL OR "id_asociacion" IS NULL);

-- CreateIndex
CREATE INDEX "anuncio_id_organizacion_idx" ON "anuncio"("id_organizacion");
CREATE INDEX "anuncio_id_asociacion_idx" ON "anuncio"("id_asociacion");

-- AddForeignKey
ALTER TABLE "anuncio" ADD CONSTRAINT "anuncio_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "anuncio" ADD CONSTRAINT "anuncio_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE CASCADE ON UPDATE CASCADE;
