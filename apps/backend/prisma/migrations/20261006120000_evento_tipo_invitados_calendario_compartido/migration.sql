-- HU-184: tipo de evento, invitados del evento y calendarios compartidos.
-- Migracion aditiva: enum y tabla nuevos, columnas con default; no toca filas
-- existentes (los eventos previos quedan como OTRO y sin invitados = todo el proyecto).

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('TUTORIA', 'REUNION', 'ENTREGA', 'REVISION', 'TALLER', 'OTRO');

-- AlterTable
ALTER TABLE "evento_proyecto" ADD COLUMN "tipo_evento" "TipoEvento" NOT NULL DEFAULT 'OTRO';
ALTER TABLE "evento_proyecto" ADD COLUMN "invitados" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "calendario_compartido" (
    "id_calendario_compartido" SERIAL NOT NULL,
    "id_propietario" INTEGER NOT NULL,
    "id_invitado" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendario_compartido_pkey" PRIMARY KEY ("id_calendario_compartido")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendario_compartido_id_propietario_id_invitado_key" ON "calendario_compartido"("id_propietario", "id_invitado");

-- CreateIndex
CREATE INDEX "calendario_compartido_id_invitado_idx" ON "calendario_compartido"("id_invitado");

-- AddForeignKey
ALTER TABLE "calendario_compartido" ADD CONSTRAINT "calendario_compartido_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendario_compartido" ADD CONSTRAINT "calendario_compartido_id_invitado_fkey" FOREIGN KEY ("id_invitado") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
