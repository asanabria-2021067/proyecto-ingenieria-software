-- ORG-1: elimina las 5 organizaciones de prueba del seed. Primero se quitan los
-- vinculos ProyectoOrganizacion (los proyectos quedan personales) y las membresias.
-- Solo toca esas organizaciones, identificadas por nombre (con y sin acentos).
DELETE FROM "proyecto_organizacion"
WHERE "id_organizacion" IN (
	SELECT "id_organizacion" FROM "organizacion"
	WHERE lower("nombre_organizacion") IN (
		'asociación de computación uvg', 'asociacion de computacion uvg',
		'asociación de ingeniería industrial', 'asociacion de ingenieria industrial',
		'centro de investigación biomédica', 'centro de investigacion biomedica',
		'grupo de robótica uvg', 'grupo de robotica uvg',
		'instituto de sostenibilidad'
	)
);

DELETE FROM "usuario_organizacion"
WHERE "id_organizacion" IN (
	SELECT "id_organizacion" FROM "organizacion"
	WHERE lower("nombre_organizacion") IN (
		'asociación de computación uvg', 'asociacion de computacion uvg',
		'asociación de ingeniería industrial', 'asociacion de ingenieria industrial',
		'centro de investigación biomédica', 'centro de investigacion biomedica',
		'grupo de robótica uvg', 'grupo de robotica uvg',
		'instituto de sostenibilidad'
	)
);

DELETE FROM "organizacion"
WHERE lower("nombre_organizacion") IN (
	'asociación de computación uvg', 'asociacion de computacion uvg',
	'asociación de ingeniería industrial', 'asociacion de ingenieria industrial',
	'centro de investigación biomédica', 'centro de investigacion biomedica',
	'grupo de robótica uvg', 'grupo de robotica uvg',
	'instituto de sostenibilidad'
);
