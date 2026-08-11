-- CreateEnum
CREATE TYPE "EstadoSolicitudSalida" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "solicitud_salida_proyecto" (
    "id_solicitud" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado_solicitud" "EstadoSolicitudSalida" NOT NULL DEFAULT 'PENDIENTE',
    "solicitada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMP(3),
    "resuelta_por" INTEGER,

    CONSTRAINT "solicitud_salida_proyecto_pkey" PRIMARY KEY ("id_solicitud")
);

-- CreateIndex
CREATE INDEX "solicitud_salida_proyecto_id_proyecto_id_usuario_idx" ON "solicitud_salida_proyecto"("id_proyecto", "id_usuario");

-- Invariante: a lo sumo una solicitud PENDIENTE por (id_proyecto, id_usuario).
-- Índice único parcial (mismo patrón que participacion_proyecto_activa_unique
-- y asignacion_tarea_activa_unique): APROBADA/RECHAZADA/CANCELADA no están
-- restringidas, así que el historial se conserva íntegro y una persona puede
-- volver a solicitar salir después de que la anterior se resuelva.
CREATE UNIQUE INDEX "solicitud_salida_proyecto_pendiente_unique"
ON "solicitud_salida_proyecto" ("id_proyecto", "id_usuario")
WHERE "estado_solicitud" = 'PENDIENTE';

-- AddForeignKey
ALTER TABLE "solicitud_salida_proyecto" ADD CONSTRAINT "solicitud_salida_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_salida_proyecto" ADD CONSTRAINT "solicitud_salida_proyecto_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_salida_proyecto" ADD CONSTRAINT "solicitud_salida_proyecto_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
