-- HU-195 (T-362): política de edición por reunión y administradores
-- autorizados. Aditiva: las reuniones existentes (ninguna antes de esta
-- serie) quedan en TODOS_ADMINISTRADORES. El rol de administrador vigente se
-- comprueba en cada acción, no aquí.

-- CreateEnum
CREATE TYPE "PoliticaEdicionReunion" AS ENUM ('TODOS_ADMINISTRADORES', 'SOLO_CREADOR', 'ADMINISTRADORES_SELECCIONADOS');

-- AlterTable
ALTER TABLE "reunion_administracion" ADD COLUMN     "politica_edicion" "PoliticaEdicionReunion" NOT NULL DEFAULT 'TODOS_ADMINISTRADORES';

-- CreateTable
CREATE TABLE "reunion_administrador_editor" (
    "id_reunion" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,

    CONSTRAINT "reunion_administrador_editor_pkey" PRIMARY KEY ("id_reunion","id_usuario")
);

-- CreateIndex
CREATE INDEX "reunion_administrador_editor_id_usuario_idx" ON "reunion_administrador_editor"("id_usuario");

-- AddForeignKey
ALTER TABLE "reunion_administrador_editor" ADD CONSTRAINT "reunion_administrador_editor_id_reunion_fkey" FOREIGN KEY ("id_reunion") REFERENCES "reunion_administracion"("id_reunion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunion_administrador_editor" ADD CONSTRAINT "reunion_administrador_editor_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
