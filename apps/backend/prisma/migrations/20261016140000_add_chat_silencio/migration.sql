-- AlterTable
ALTER TABLE "conversacion_participante" ADD COLUMN     "silenciada_hasta" TIMESTAMP(3),
ADD COLUMN     "silenciada_siempre" BOOLEAN NOT NULL DEFAULT false;
