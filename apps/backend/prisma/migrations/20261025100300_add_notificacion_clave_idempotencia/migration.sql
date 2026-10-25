-- HU-195 (T-364): idempotencia duradera de avisos. Columna opcional con
-- la operación lógica que originó el aviso y un índice único por usuario. Las
-- filas existentes quedan en NULL; PostgreSQL trata cada NULL como distinto,
-- así que no hay conflicto con el histórico ni con los avisos sin clave.

-- AlterTable
ALTER TABLE "notificacion" ADD COLUMN     "clave_idempotencia" VARCHAR(160);

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_id_usuario_clave_idempotencia_key" ON "notificacion"("id_usuario", "clave_idempotencia");
