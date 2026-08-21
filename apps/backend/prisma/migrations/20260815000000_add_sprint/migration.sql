-- CreateEnum
CREATE TYPE "EstadoSprint" AS ENUM ('ACTIVO', 'EN_FINALIZACION', 'CERRADO');

-- CreateTable
CREATE TABLE "sprint" (
    "id_sprint" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoSprint" NOT NULL DEFAULT 'ACTIVO',
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_finalizacion_iniciada" TIMESTAMP(3),
    "fecha_cierre" TIMESTAMP(3),
    "cerrado_por" INTEGER,

    CONSTRAINT "sprint_pkey" PRIMARY KEY ("id_sprint")
);

-- CreateIndex
CREATE INDEX "sprint_id_proyecto_estado_idx" ON "sprint"("id_proyecto", "estado");

-- Invariante: a lo sumo un Sprint operable (ACTIVO o EN_FINALIZACION) por
-- id_proyecto. Índice único parcial (mismo patrón que
-- participacion_proyecto_activa_unique, asignacion_tarea_activa_unique y
-- solicitud_salida_proyecto_pendiente_unique): CERRADO no está restringido,
-- así que el historial completo de sprints se conserva y un proyecto puede
-- tener múltiples sprints cerrados junto con un único sprint operable vigente.
CREATE UNIQUE INDEX "sprint_operable_unique"
ON "sprint" ("id_proyecto")
WHERE "estado" IN ('ACTIVO', 'EN_FINALIZACION');

-- AddForeignKey
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint" ADD CONSTRAINT "sprint_cerrado_por_fkey" FOREIGN KEY ("cerrado_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
