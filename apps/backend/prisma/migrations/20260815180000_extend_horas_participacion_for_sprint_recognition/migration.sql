-- FND-07: Foundation de datos exclusivamente para el futuro reconocimiento
-- de horas por Sprint (Flow A). No implementa cálculo, reconocimiento,
-- ajuste funcional ni la regla "horas_aprobadas != horas_calculadas exige
-- justificacion_ajuste" (eso es capa de servicio, no schema/DB). Sin
-- backfill: las filas existentes de horas_participacion quedan con las tres
-- columnas nuevas en NULL.
--
-- horas_calculadas usa exactamente el mismo tipo/precisión que
-- horas_reportadas/horas_aprobadas (DECIMAL(6,2)), nullable porque una fila
-- sin cálculo todavía debe poder representar esa ausencia sin un default
-- artificial.
--
-- id_sprint es nullable (una participación puede no tener aún horas
-- vinculadas a un Sprint concreto) con ON DELETE SET NULL: borrar un Sprint
-- nunca debe borrar en cascada un HorasParticipacion histórico, mismo
-- patrón ya usado para AsignacionTarea.idParticipacion (FND-06) y
-- Tarea.rolProyecto.
ALTER TABLE "horas_participacion" ADD COLUMN     "horas_calculadas" DECIMAL(6,2),
ADD COLUMN     "id_sprint" INTEGER,
ADD COLUMN     "justificacion_ajuste" TEXT;

-- CreateIndex
CREATE INDEX "horas_participacion_id_sprint_idx" ON "horas_participacion"("id_sprint");

-- AddForeignKey
ALTER TABLE "horas_participacion" ADD CONSTRAINT "horas_participacion_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE SET NULL ON UPDATE CASCADE;
