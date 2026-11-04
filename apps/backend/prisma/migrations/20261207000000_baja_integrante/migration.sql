-- MEJ-105: motivo y ejecutor de la baja de un integrante (aditivo).
ALTER TABLE "participacion_proyecto"
	ADD COLUMN IF NOT EXISTS "motivo_baja" TEXT,
	ADD COLUMN IF NOT EXISTS "baja_por" INTEGER;
