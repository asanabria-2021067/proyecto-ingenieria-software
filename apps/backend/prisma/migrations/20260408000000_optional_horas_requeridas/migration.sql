-- Make horas_beca_requeridas optional and add horas_extension_requeridas
ALTER TABLE "perfil_estudiante"
	ALTER COLUMN "horas_beca_requeridas" DROP NOT NULL,
	ALTER COLUMN "horas_beca_requeridas" DROP DEFAULT;

ALTER TABLE "perfil_estudiante"
	ADD COLUMN "horas_extension_requeridas" INTEGER;
