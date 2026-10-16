-- CreateEnum
CREATE TYPE "NivelAnuncio" AS ENUM ('INFO', 'ADVERTENCIA', 'URGENTE');

-- CreateEnum
CREATE TYPE "AudienciaAnuncio" AS ENUM ('TODOS', 'ESTUDIANTES');

-- CreateTable
CREATE TABLE "anuncio" (
    "id_anuncio" SERIAL NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "nivel" "NivelAnuncio" NOT NULL DEFAULT 'INFO',
    "audiencia" "AudienciaAnuncio" NOT NULL DEFAULT 'TODOS',
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anuncio_pkey" PRIMARY KEY ("id_anuncio")
);

-- CreateTable
CREATE TABLE "anuncio_cierre" (
    "id_anuncio_cierre" SERIAL NOT NULL,
    "id_anuncio" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "cerrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anuncio_cierre_pkey" PRIMARY KEY ("id_anuncio_cierre")
);

-- CreateIndex
CREATE INDEX "anuncio_activo_fecha_inicio_fecha_fin_idx" ON "anuncio"("activo", "fecha_inicio", "fecha_fin");

-- CreateIndex
CREATE INDEX "anuncio_cierre_id_usuario_idx" ON "anuncio_cierre"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "anuncio_cierre_id_anuncio_id_usuario_key" ON "anuncio_cierre"("id_anuncio", "id_usuario");

-- AddForeignKey
ALTER TABLE "anuncio_cierre" ADD CONSTRAINT "anuncio_cierre_id_anuncio_fkey" FOREIGN KEY ("id_anuncio") REFERENCES "anuncio"("id_anuncio") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anuncio_cierre" ADD CONSTRAINT "anuncio_cierre_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
