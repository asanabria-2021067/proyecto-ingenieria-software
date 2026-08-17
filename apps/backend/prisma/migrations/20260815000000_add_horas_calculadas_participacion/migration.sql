-- AlterTable: T-115 -- HorasParticipacion gana horasCalculadas y
-- justificacionAjuste. No se toca horasReportadas ni horasAprobadas.
ALTER TABLE "horas_participacion" ADD COLUMN "horas_calculadas" DECIMAL(6,2);
ALTER TABLE "horas_participacion" ADD COLUMN "justificacion_ajuste" TEXT;
