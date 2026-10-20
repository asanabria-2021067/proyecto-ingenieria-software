-- HU-190 (T-346/T-347): insignias por niveles. Aditiva: un valor de enum, un enum
-- nuevo, dos tablas y el catálogo inicial (el mismo que InsigniasCatalog; el
-- backfill lo vuelve a sincronizar con upsert, así que ambos caminos convergen).
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'INSIGNIA_OBTENIDA';

CREATE TYPE "NivelInsignia" AS ENUM ('BRONCE', 'PLATA', 'ORO', 'DIAMANTE');

CREATE TABLE "insignia" (
    "id_insignia" SERIAL NOT NULL,
    "clave" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "icono" VARCHAR(40) NOT NULL,
    "metrica" VARCHAR(40) NOT NULL,
    "umbral_bronce" INTEGER NOT NULL,
    "umbral_plata" INTEGER NOT NULL,
    "umbral_oro" INTEGER NOT NULL,
    "umbral_diamante" INTEGER NOT NULL,

    CONSTRAINT "insignia_pkey" PRIMARY KEY ("id_insignia")
);

CREATE TABLE "insignia_usuario" (
    "id_insignia_usuario" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_insignia" INTEGER NOT NULL,
    "nivel" "NivelInsignia",
    "progreso" INTEGER NOT NULL DEFAULT 0,
    "fecha_bronce" TIMESTAMP(3),
    "fecha_plata" TIMESTAMP(3),
    "fecha_oro" TIMESTAMP(3),
    "fecha_diamante" TIMESTAMP(3),

    CONSTRAINT "insignia_usuario_pkey" PRIMARY KEY ("id_insignia_usuario")
);

CREATE UNIQUE INDEX "insignia_clave_key" ON "insignia"("clave");

CREATE UNIQUE INDEX "insignia_usuario_id_usuario_id_insignia_key" ON "insignia_usuario"("id_usuario", "id_insignia");

ALTER TABLE "insignia_usuario" ADD CONSTRAINT "insignia_usuario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "insignia_usuario" ADD CONSTRAINT "insignia_usuario_id_insignia_fkey" FOREIGN KEY ("id_insignia") REFERENCES "insignia"("id_insignia") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "insignia" ("clave", "nombre", "descripcion", "icono", "metrica", "umbral_bronce", "umbral_plata", "umbral_oro", "umbral_diamante") VALUES
	('tareas', 'Tareas completadas', 'Tareas en Hecho en las que estuviste asignado.', 'CheckCircle2', 'tareas', 1, 10, 50, 100),
	('horas', 'Horas acreditadas', 'Horas de participación aprobadas y acreditadas.', 'Clock', 'horas', 5, 25, 100, 250),
	('cerrados', 'Proyectos cerrados', 'Proyectos cerrados en los que participaste como integrante.', 'FolderCheck', 'cerrados', 1, 3, 5, 10),
	('liderados', 'Proyectos liderados', 'Proyectos cerrados que lideraste.', 'Crown', 'liderados', 1, 2, 4, 8),
	('postulaciones', 'Postulaciones aceptadas', 'Postulaciones a roles que fueron aceptadas.', 'UserCheck', 'postulaciones', 1, 3, 5, 10),
	('comentarios', 'Comentarios en tareas', 'Comentarios que escribiste en tareas.', 'MessageSquare', 'comentarios', 5, 25, 100, 250),
	('sprints', 'Sprints completados', 'Sprints cerrados en los que completaste al menos una tarea.', 'Flag', 'sprints', 1, 5, 10, 20)
ON CONFLICT ("clave") DO NOTHING;
