-- CreateEnum
CREATE TYPE "EstadoSolicitudRecuperacion" AS ENUM ('PENDIENTE', 'ATENDIDA');

-- CreateTable
CREATE TABLE "solicitud_recuperacion" (
    "id_solicitud" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "carne_referencia" VARCHAR(255) NOT NULL,
    "correo_referencia" VARCHAR(255) NOT NULL,
    "estado" "EstadoSolicitudRecuperacion" NOT NULL DEFAULT 'PENDIENTE',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendida_en" TIMESTAMP(3),
    "atendida_por" INTEGER,

    CONSTRAINT "solicitud_recuperacion_pkey" PRIMARY KEY ("id_solicitud")
);

-- CreateIndex
CREATE INDEX "solicitud_recuperacion_estado_idx" ON "solicitud_recuperacion"("estado");

-- AddForeignKey
ALTER TABLE "solicitud_recuperacion" ADD CONSTRAINT "solicitud_recuperacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_recuperacion" ADD CONSTRAINT "solicitud_recuperacion_atendida_por_fkey" FOREIGN KEY ("atendida_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
