-- CreateEnum
CREATE TYPE "TipoEstadoChat" AS ENUM ('EN_CLASE', 'OCUPADO', 'DISPONIBLE', 'PERSONALIZADO');

-- CreateTable
CREATE TABLE "estado_chat_usuario" (
    "id_usuario" INTEGER NOT NULL,
    "tipo" "TipoEstadoChat" NOT NULL,
    "texto" VARCHAR(60),
    "vence_en" TIMESTAMP(3),

    CONSTRAINT "estado_chat_usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- AddForeignKey
ALTER TABLE "estado_chat_usuario" ADD CONSTRAINT "estado_chat_usuario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
