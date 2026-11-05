-- Quita el rol mentor (unica excepcion a migraciones solo aditivas). Idempotente.
-- lider_asociacion se conserva en rol_acceso: ahora se deriva de junta_asociacion.
-- Quien solo tenia esa fila y ninguna junta activa recibe estudiante (la fila vieja se conserva).

CREATE TEMP TABLE "_con_rol_antes" AS
SELECT DISTINCT "id_usuario" FROM "usuario_rol_acceso";

DO $$
DECLARE
	v_mentores INTEGER;
	v_sin_junta TEXT;
BEGIN
	SELECT COUNT(DISTINCT ura."id_usuario") INTO v_mentores
	FROM "usuario_rol_acceso" ura
	JOIN "rol_acceso" ra ON ra."id_rol_acceso" = ura."id_rol_acceso"
	WHERE ra."nombre_perfil" = 'mentor';
	RAISE NOTICE 'usuarios con rol mentor: %', v_mentores;

	SELECT STRING_AGG(DISTINCT ura."id_usuario"::TEXT, ',') INTO v_sin_junta
	FROM "usuario_rol_acceso" ura
	JOIN "rol_acceso" ra ON ra."id_rol_acceso" = ura."id_rol_acceso"
	WHERE ra."nombre_perfil" = 'lider_asociacion'
	AND NOT EXISTS (
		SELECT 1 FROM "junta_asociacion" j
		JOIN "asociacion" a ON a."id_asociacion" = j."id_asociacion" AND NOT a."archivada"
		WHERE j."id_usuario" = ura."id_usuario"
	);
	RAISE NOTICE 'usuarios con lider_asociacion sin junta activa (rol viejo sin efecto): %', COALESCE(v_sin_junta, 'ninguno');

	IF v_mentores > 0 OR v_sin_junta IS NOT NULL THEN
		INSERT INTO "rol_acceso" ("nombre_perfil", "descripcion")
		SELECT 'estudiante', 'Estudiante'
		WHERE NOT EXISTS (SELECT 1 FROM "rol_acceso" WHERE "nombre_perfil" = 'estudiante');
	END IF;
END $$;

INSERT INTO "usuario_rol_acceso" ("id_usuario", "id_rol_acceso")
SELECT DISTINCT m."id_usuario", e."id_rol_acceso"
FROM "usuario_rol_acceso" m
JOIN "rol_acceso" rm ON rm."id_rol_acceso" = m."id_rol_acceso" AND rm."nombre_perfil" = 'mentor'
JOIN "rol_acceso" e ON e."nombre_perfil" = 'estudiante'
ON CONFLICT ("id_usuario", "id_rol_acceso") DO NOTHING;

DELETE FROM "usuario_rol_acceso"
WHERE "id_rol_acceso" IN (SELECT "id_rol_acceso" FROM "rol_acceso" WHERE "nombre_perfil" = 'mentor');

CREATE TEMP TABLE "_lider_solo_fila" AS
SELECT DISTINCT ura."id_usuario"
FROM "usuario_rol_acceso" ura
JOIN "rol_acceso" ra ON ra."id_rol_acceso" = ura."id_rol_acceso" AND ra."nombre_perfil" = 'lider_asociacion'
WHERE NOT EXISTS (
	SELECT 1 FROM "junta_asociacion" j
	JOIN "asociacion" a ON a."id_asociacion" = j."id_asociacion" AND NOT a."archivada"
	WHERE j."id_usuario" = ura."id_usuario"
)
AND NOT EXISTS (
	SELECT 1 FROM "usuario_rol_acceso" o
	JOIN "rol_acceso" ro ON ro."id_rol_acceso" = o."id_rol_acceso" AND ro."nombre_perfil" <> 'lider_asociacion'
	WHERE o."id_usuario" = ura."id_usuario"
);

DO $$
DECLARE
	v_ids TEXT;
BEGIN
	SELECT STRING_AGG("id_usuario"::TEXT, ',') INTO v_ids FROM "_lider_solo_fila";
	RAISE NOTICE 'usuarios que solo tenian lider_asociacion y reciben estudiante: %', COALESCE(v_ids, 'ninguno');
END $$;

INSERT INTO "usuario_rol_acceso" ("id_usuario", "id_rol_acceso")
SELECT l."id_usuario", e."id_rol_acceso"
FROM "_lider_solo_fila" l
JOIN "rol_acceso" e ON e."nombre_perfil" = 'estudiante'
ON CONFLICT ("id_usuario", "id_rol_acceso") DO NOTHING;

DELETE FROM "rol_permiso"
WHERE "id_rol_acceso" IN (SELECT "id_rol_acceso" FROM "rol_acceso" WHERE "nombre_perfil" = 'mentor');

DELETE FROM "rol_acceso" ra
WHERE ra."nombre_perfil" = 'mentor'
AND NOT EXISTS (SELECT 1 FROM "usuario_rol_acceso" ura WHERE ura."id_rol_acceso" = ra."id_rol_acceso");

DO $$
DECLARE
	v_sin_rol TEXT;
BEGIN
	SELECT STRING_AGG(c."id_usuario"::TEXT, ',') INTO v_sin_rol
	FROM "_con_rol_antes" c
	WHERE NOT EXISTS (
		SELECT 1 FROM "usuario_rol_acceso" ura
		JOIN "rol_acceso" ra ON ra."id_rol_acceso" = ura."id_rol_acceso"
		WHERE ura."id_usuario" = c."id_usuario" AND ra."nombre_perfil" <> 'lider_asociacion'
	)
	AND NOT EXISTS (
		SELECT 1 FROM "junta_asociacion" j
		JOIN "asociacion" a ON a."id_asociacion" = j."id_asociacion" AND NOT a."archivada"
		WHERE j."id_usuario" = c."id_usuario"
	);
	IF v_sin_rol IS NOT NULL THEN
		RAISE EXCEPTION 'usuarios que quedarian sin rol de acceso: %', v_sin_rol;
	END IF;
	IF EXISTS (SELECT 1 FROM "rol_acceso" WHERE "nombre_perfil" = 'mentor') THEN
		RAISE EXCEPTION 'el rol mentor sigue referenciado';
	END IF;
END $$;

DROP TABLE "_con_rol_antes";

DROP TABLE "_lider_solo_fila";
