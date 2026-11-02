-- ASO: asociaciones oficiales, carreras que representan, junta directiva y
-- publicacion de proyectos a nombre de una asociacion. Solo agrega objetos.

-- CreateEnum
CREATE TYPE "CargoJunta" AS ENUM ('PRESIDENTE', 'VICEPRESIDENTE', 'SECRETARIO', 'TESORERO', 'VOCAL');

-- CreateEnum
CREATE TYPE "NivelPermisoJunta" AS ENUM ('ADMINISTRADOR', 'EDITOR', 'LECTURA');

-- CreateTable
CREATE TABLE "asociacion" (
	"id_asociacion" SERIAL NOT NULL,
	"nombre" VARCHAR(255) NOT NULL,
	"logo_url" VARCHAR(500),
	"descripcion" TEXT,
	"archivada" BOOLEAN NOT NULL DEFAULT false,
	"fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"fecha_actualizacion" TIMESTAMP(3),

	CONSTRAINT "asociacion_pkey" PRIMARY KEY ("id_asociacion")
);

-- CreateTable
CREATE TABLE "asociacion_carrera" (
	"id_asociacion" INTEGER NOT NULL,
	"id_carrera" INTEGER NOT NULL,

	CONSTRAINT "asociacion_carrera_pkey" PRIMARY KEY ("id_asociacion", "id_carrera")
);

-- CreateTable
CREATE TABLE "junta_asociacion" (
	"id_junta_asociacion" SERIAL NOT NULL,
	"id_asociacion" INTEGER NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"cargo" "CargoJunta" NOT NULL,
	"nivel_permiso" "NivelPermisoJunta" NOT NULL,
	"asignado_por" INTEGER,
	"fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "junta_asociacion_pkey" PRIMARY KEY ("id_junta_asociacion")
);

-- AlterTable
ALTER TABLE "proyecto" ADD COLUMN "id_asociacion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "asociacion_nombre_key" ON "asociacion"("nombre");

-- CreateIndex
CREATE INDEX "asociacion_carrera_id_carrera_idx" ON "asociacion_carrera"("id_carrera");

-- CreateIndex
CREATE UNIQUE INDEX "junta_asociacion_id_asociacion_cargo_key" ON "junta_asociacion"("id_asociacion", "cargo");

-- CreateIndex
CREATE UNIQUE INDEX "junta_asociacion_id_asociacion_id_usuario_key" ON "junta_asociacion"("id_asociacion", "id_usuario");

-- CreateIndex
CREATE INDEX "junta_asociacion_id_usuario_idx" ON "junta_asociacion"("id_usuario");

-- CreateIndex
CREATE INDEX "proyecto_id_asociacion_idx" ON "proyecto"("id_asociacion");

-- AddForeignKey
ALTER TABLE "asociacion_carrera" ADD CONSTRAINT "asociacion_carrera_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asociacion_carrera" ADD CONSTRAINT "asociacion_carrera_id_carrera_fkey" FOREIGN KEY ("id_carrera") REFERENCES "carrera"("id_carrera") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "junta_asociacion" ADD CONSTRAINT "junta_asociacion_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "junta_asociacion" ADD CONSTRAINT "junta_asociacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_asociacion_fkey" FOREIGN KEY ("id_asociacion") REFERENCES "asociacion"("id_asociacion") ON DELETE RESTRICT ON UPDATE CASCADE;
