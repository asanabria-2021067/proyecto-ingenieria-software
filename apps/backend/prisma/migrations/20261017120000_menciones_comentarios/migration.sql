-- HU-200 (T-376/T-377): menciones con @ en comentarios. Aditiva: un valor de
-- enum para la notificación de mención y una tabla con las menciones ya
-- validadas (una por usuario y comentario). No toca filas existentes.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'MENCION_COMENTARIO';

CREATE TABLE "mencion_comentario" (
    "id_mencion" SERIAL NOT NULL,
    "id_comentario" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mencion_comentario_pkey" PRIMARY KEY ("id_mencion")
);

CREATE UNIQUE INDEX "mencion_comentario_id_comentario_id_usuario_key" ON "mencion_comentario"("id_comentario", "id_usuario");

CREATE INDEX "mencion_comentario_id_usuario_idx" ON "mencion_comentario"("id_usuario");

ALTER TABLE "mencion_comentario" ADD CONSTRAINT "mencion_comentario_id_comentario_fkey" FOREIGN KEY ("id_comentario") REFERENCES "comentario"("id_comentario") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mencion_comentario" ADD CONSTRAINT "mencion_comentario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
