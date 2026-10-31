-- RTF-3.2: una sola fila de amistad por par NO ordenado de usuarios.
-- El @@unique([id_usuario_solicitante, id_usuario_receptor]) es direccional:
-- dos solicitudes cruzadas (A->B y B->A) podian coexistir.

-- 1) Resolver duplicados existentes de forma determinista. Por cada par no
-- ordenado se conserva UNA fila: la ACEPTADA (si hay varias, la mas antigua por
-- fecha_solicitud y luego menor id_amistad); si ninguna esta ACEPTADA, la mas antigua por fecha_solicitud
-- (desempate por id_amistad). El resto se elimina.
DELETE FROM "amistad"
WHERE "id_amistad" IN (
	SELECT "id_amistad"
	FROM (
		SELECT
			"id_amistad",
			ROW_NUMBER() OVER (
				PARTITION BY
					LEAST("id_usuario_solicitante", "id_usuario_receptor"),
					GREATEST("id_usuario_solicitante", "id_usuario_receptor")
				ORDER BY
					("estado" = 'ACEPTADA') DESC,
					"fecha_solicitud" ASC,
					"id_amistad" ASC
			) AS "orden"
		FROM "amistad"
	) AS "ranked"
	WHERE "orden" > 1
);

-- 2) Indice unico sobre el par normalizado. Se usa un indice de expresion en
-- SQL (sin columnas extra ni cambios en las escrituras existentes); Prisma no
-- modela indices de expresion y los ignora al comparar el schema.
CREATE UNIQUE INDEX "amistad_par_no_ordenado_key"
	ON "amistad" (
		LEAST("id_usuario_solicitante", "id_usuario_receptor"),
		GREATEST("id_usuario_solicitante", "id_usuario_receptor")
	);
