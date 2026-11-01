-- HRS: registro de horas por estudiante y semestre.
CREATE TABLE "registro_horas_semestre" (
	"id_registro" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"anio" INTEGER NOT NULL,
	"periodo" INTEGER NOT NULL,
	"meta_beca" INTEGER,
	"beca_declarada" INTEGER NOT NULL DEFAULT 0,
	"meta_extension" INTEGER,
	"extension_declarada" INTEGER NOT NULL DEFAULT 0,
	"fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "registro_horas_semestre_pkey" PRIMARY KEY ("id_registro"),
	CONSTRAINT "registro_horas_semestre_periodo_check" CHECK ("periodo" IN (1, 2))
);

CREATE UNIQUE INDEX "registro_horas_semestre_id_usuario_anio_periodo_key"
	ON "registro_horas_semestre"("id_usuario", "anio", "periodo");

CREATE INDEX "registro_horas_semestre_anio_periodo_idx"
	ON "registro_horas_semestre"("anio", "periodo");

ALTER TABLE "registro_horas_semestre"
	ADD CONSTRAINT "registro_horas_semestre_id_usuario_fkey"
	FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las horas requeridas actuales del perfil pasan a ser la meta del semestre actual (hora de Guatemala).
INSERT INTO "registro_horas_semestre" ("id_usuario", "anio", "periodo", "meta_beca", "meta_extension")
SELECT
	"id_usuario",
	EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala'))::INTEGER,
	CASE WHEN EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')) <= 6 THEN 1 ELSE 2 END,
	"horas_beca_requeridas",
	"horas_extension_requeridas"
FROM "perfil_estudiante"
WHERE "horas_beca_requeridas" IS NOT NULL OR "horas_extension_requeridas" IS NOT NULL
ON CONFLICT ("id_usuario", "anio", "periodo") DO NOTHING;

-- Verificacion: ningun usuario con meta en el perfil puede quedar sin registro o con meta distinta.
DO $$
DECLARE
	perdidos INTEGER;
BEGIN
	SELECT COUNT(*) INTO perdidos
	FROM "perfil_estudiante" p
	LEFT JOIN "registro_horas_semestre" r
		ON r."id_usuario" = p."id_usuario"
		AND r."anio" = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala'))::INTEGER
		AND r."periodo" = CASE WHEN EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')) <= 6 THEN 1 ELSE 2 END
	WHERE (p."horas_beca_requeridas" IS NOT NULL OR p."horas_extension_requeridas" IS NOT NULL)
		AND (
			r."id_registro" IS NULL
			OR r."meta_beca" IS DISTINCT FROM p."horas_beca_requeridas"
			OR r."meta_extension" IS DISTINCT FROM p."horas_extension_requeridas"
		);
	IF perdidos > 0 THEN
		RAISE EXCEPTION 'Migracion HRS: % usuario(s) con meta de horas sin registro del semestre actual', perdidos;
	END IF;
END $$;
