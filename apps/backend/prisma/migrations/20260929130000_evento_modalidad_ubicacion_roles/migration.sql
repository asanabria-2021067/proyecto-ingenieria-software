-- Modal "Nuevo evento": modalidad de la sesion, ubicacion (mapa) y roles destino.
-- Migracion aditiva: columnas nuevas nullable / con default, no toca filas existentes.
CREATE TYPE "ModalidadEvento" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'MIXTA');

ALTER TABLE "evento_proyecto" ADD COLUMN "modalidad" "ModalidadEvento" NOT NULL DEFAULT 'VIRTUAL';
ALTER TABLE "evento_proyecto" ADD COLUMN "ubicacion_lat" DOUBLE PRECISION;
ALTER TABLE "evento_proyecto" ADD COLUMN "ubicacion_lng" DOUBLE PRECISION;
ALTER TABLE "evento_proyecto" ADD COLUMN "ubicacion_nombre" VARCHAR(255);
ALTER TABLE "evento_proyecto" ADD COLUMN "link_sesion" VARCHAR(500);
ALTER TABLE "evento_proyecto" ADD COLUMN "roles_destino" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
