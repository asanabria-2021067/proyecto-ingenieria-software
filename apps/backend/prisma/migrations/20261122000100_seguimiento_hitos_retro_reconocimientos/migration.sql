-- MEJ-54: marca del aviso de atraso de un hito (un aviso por hito).
ALTER TABLE "hito" ADD COLUMN "alerta_atraso_enviada_en" TIMESTAMP(3);

-- MEJ-24: retrospectiva opcional de un Sprint (una por Sprint).
CREATE TABLE "retrospectiva_sprint" (
	"id_retrospectiva" SERIAL NOT NULL,
	"id_sprint" INTEGER NOT NULL,
	"id_proyecto" INTEGER NOT NULL,
	"que_paso" VARCHAR(1000) NOT NULL,
	"que_podria_mejorar" VARCHAR(1000) NOT NULL,
	"acuerdos" VARCHAR(1000) NOT NULL,
	"creada_por" INTEGER NOT NULL,
	"actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "retrospectiva_sprint_pkey" PRIMARY KEY ("id_retrospectiva")
);

CREATE UNIQUE INDEX "retrospectiva_sprint_id_sprint_key" ON "retrospectiva_sprint"("id_sprint");
CREATE INDEX "retrospectiva_sprint_id_proyecto_idx" ON "retrospectiva_sprint"("id_proyecto");

ALTER TABLE "retrospectiva_sprint" ADD CONSTRAINT "retrospectiva_sprint_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retrospectiva_sprint" ADD CONSTRAINT "retrospectiva_sprint_creada_por_fkey" FOREIGN KEY ("creada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MEJ-57: reconocimientos entre companeros (uno por persona por Sprint, nunca a uno mismo).
CREATE TABLE "reconocimiento_companero" (
	"id_reconocimiento" SERIAL NOT NULL,
	"id_sprint" INTEGER NOT NULL,
	"id_proyecto" INTEGER NOT NULL,
	"id_autor" INTEGER NOT NULL,
	"id_receptor" INTEGER NOT NULL,
	"mensaje" VARCHAR(280) NOT NULL,
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "reconocimiento_companero_pkey" PRIMARY KEY ("id_reconocimiento"),
	CONSTRAINT "reconocimiento_companero_no_a_uno_mismo" CHECK ("id_autor" <> "id_receptor")
);

CREATE UNIQUE INDEX "reconocimiento_companero_id_sprint_id_autor_key" ON "reconocimiento_companero"("id_sprint", "id_autor");
CREATE INDEX "reconocimiento_companero_id_receptor_idx" ON "reconocimiento_companero"("id_receptor");
CREATE INDEX "reconocimiento_companero_id_proyecto_idx" ON "reconocimiento_companero"("id_proyecto");

ALTER TABLE "reconocimiento_companero" ADD CONSTRAINT "reconocimiento_companero_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconocimiento_companero" ADD CONSTRAINT "reconocimiento_companero_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconocimiento_companero" ADD CONSTRAINT "reconocimiento_companero_id_receptor_fkey" FOREIGN KEY ("id_receptor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MEJ-57: insignia nueva «Companero ejemplar» (el catalogo de codigo la vuelve a sincronizar con upsert).
INSERT INTO "insignia" ("clave", "nombre", "descripcion", "icono", "metrica", "umbral_bronce", "umbral_plata", "umbral_oro", "umbral_diamante")
VALUES ('companerismo', 'Compañero ejemplar', 'Reconocimientos que te dieron tus compañeros de equipo en los sprints.', 'Handshake', 'companerismo', 1, 3, 6, 12)
ON CONFLICT ("clave") DO NOTHING;
