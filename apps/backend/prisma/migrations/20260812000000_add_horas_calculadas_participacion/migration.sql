-- AlterTable: T-115 — HorasParticipacion gana horasCalculadas (snapshot
-- automático desde tareas HECHO) y justificacionAjuste (obligatoria solo si
-- el valor final difiere del calculado). No se toca horasReportadas ni
-- horasAprobadas: siguen siendo la fuente que ya leen los dashboards
-- (admin.service.ts, users.service.ts) sin ningún cambio.
ALTER TABLE "horas_participacion" ADD COLUMN "horas_calculadas" DECIMAL(6,2);
ALTER TABLE "horas_participacion" ADD COLUMN "justificacion_ajuste" TEXT;
