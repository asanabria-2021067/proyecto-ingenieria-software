-- HU-142 (T-169): tabla aditiva para registros de tiempo trabajado por
-- tarea, con FKs a asignacion_tarea y usuario. No reemplaza
-- registro_avance_asignacion (bitácora de texto, sin campo numérico de
-- horas) ni horas_participacion (agregación/aprobación por período o
-- Sprint): esta tabla es exclusivamente la fuente granular de eventos de
-- horas cuya suma alimenta asignacion_tarea.horas_reales del tramo activo
-- (capa de servicio, sin trigger ni constraint aquí). Migración puramente
-- aditiva: no toca ninguna tabla existente.
--
-- FKs con ON DELETE RESTRICT (default de Prisma para relaciones
-- obligatorias, igual que registro_avance_asignacion): un registro de
-- tiempo es evidencia histórica y nunca debe desaparecer silenciosamente
-- porque se intente borrar su AsignacionTarea o su usuario.
CREATE TABLE "registro_tiempo_tarea" (
    "id_registro_tiempo" SERIAL NOT NULL,
    "id_asignacion" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "horas" DECIMAL(6,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_tiempo_tarea_pkey" PRIMARY KEY ("id_registro_tiempo")
);

-- CreateIndex
CREATE INDEX "registro_tiempo_tarea_id_asignacion_idx" ON "registro_tiempo_tarea"("id_asignacion");

-- CreateIndex
CREATE INDEX "registro_tiempo_tarea_id_usuario_idx" ON "registro_tiempo_tarea"("id_usuario");

-- AddForeignKey
ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "registro_tiempo_tarea_id_asignacion_fkey" FOREIGN KEY ("id_asignacion") REFERENCES "asignacion_tarea"("id_asignacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_tiempo_tarea" ADD CONSTRAINT "registro_tiempo_tarea_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
