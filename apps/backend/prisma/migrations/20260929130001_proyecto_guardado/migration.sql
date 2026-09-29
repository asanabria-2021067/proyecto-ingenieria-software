-- Bookmark personal de proyectos ("guardar" en Explorar Proyectos).
-- Migración aditiva: tabla nueva, no toca nada existente.
CREATE TABLE "proyecto_guardado" (
    "id_usuario" INTEGER NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "guardado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_guardado_pkey" PRIMARY KEY ("id_usuario", "id_proyecto")
);

ALTER TABLE "proyecto_guardado" ADD CONSTRAINT "proyecto_guardado_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proyecto_guardado" ADD CONSTRAINT "proyecto_guardado_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE CASCADE ON UPDATE CASCADE;
