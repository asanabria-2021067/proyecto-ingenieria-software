-- EstadoProyecto additions
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'EN_REVISION';
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'OBSERVADO';
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'EN_SOLICITUD_CIERRE';
ALTER TYPE "EstadoProyecto" ADD VALUE IF NOT EXISTS 'CANCELADO';

-- EstadoRevisionProyecto enum
DO $$
BEGIN
  CREATE TYPE "EstadoRevisionProyecto" AS ENUM ('PENDIENTE', 'APROBADA', 'OBSERVADA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- TipoNotificacion additions
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_EN_REVISION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_OBSERVADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_APROBADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_ACTUALIZADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'SOLICITUD_CIERRE_PROYECTO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CIERRE_APROBADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CIERRE_RECHAZADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'TAREA_ACTUALIZADA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'HITO_ACTUALIZADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'COMENTARIO_PROYECTO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'COMENTARIO_TAREA';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'COMENTARIO_HITO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'MENSAJE_REVISION';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'PROYECTO_ADVERTENCIA_INACTIVIDAD';

-- revision_proyecto
CREATE TABLE IF NOT EXISTS "revision_proyecto" (
  "id_revision_proyecto" SERIAL NOT NULL,
  "id_proyecto" INTEGER NOT NULL,
  "id_revisor" INTEGER,
  "estado_revision" "EstadoRevisionProyecto" NOT NULL DEFAULT 'PENDIENTE',
  "comentario_revision" TEXT,
  "numero_envio" INTEGER NOT NULL,
  "enviada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revisada_en" TIMESTAMP(3),
  CONSTRAINT "revision_proyecto_pkey" PRIMARY KEY ("id_revision_proyecto")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_una_revision_pendiente_por_proyecto"
  ON "revision_proyecto"("id_proyecto")
  WHERE "estado_revision" = 'PENDIENTE';

DO $$
BEGIN
  ALTER TABLE "revision_proyecto"
    ADD CONSTRAINT "revision_proyecto_id_proyecto_fkey"
    FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "revision_proyecto"
    ADD CONSTRAINT "revision_proyecto_id_revisor_fkey"
    FOREIGN KEY ("id_revisor") REFERENCES "usuario"("id_usuario")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- comentario
CREATE TABLE IF NOT EXISTS "comentario" (
  "id_comentario" SERIAL NOT NULL,
  "id_autor" INTEGER NOT NULL,
  "id_proyecto" INTEGER,
  "id_tarea" INTEGER,
  "id_hito" INTEGER,
  "contenido" TEXT NOT NULL,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editado_en" TIMESTAMP(3),
  "eliminado_en" TIMESTAMP(3),
  CONSTRAINT "comentario_pkey" PRIMARY KEY ("id_comentario")
);

DO $$
BEGIN
  ALTER TABLE "comentario"
    ADD CONSTRAINT "chk_comentario_exactamente_una_entidad"
    CHECK (
      (
        CASE WHEN "id_proyecto" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "id_tarea" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "id_hito" IS NOT NULL THEN 1 ELSE 0 END
      ) = 1
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "comentario"
    ADD CONSTRAINT "comentario_id_autor_fkey"
    FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "comentario"
    ADD CONSTRAINT "comentario_id_proyecto_fkey"
    FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "comentario"
    ADD CONSTRAINT "comentario_id_tarea_fkey"
    FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "comentario"
    ADD CONSTRAINT "comentario_id_hito_fkey"
    FOREIGN KEY ("id_hito") REFERENCES "hito"("id_hito")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- mensaje_revision_proyecto
CREATE TABLE IF NOT EXISTS "mensaje_revision_proyecto" (
  "id_mensaje" SERIAL NOT NULL,
  "id_proyecto" INTEGER NOT NULL,
  "id_remitente" INTEGER NOT NULL,
  "id_revision" INTEGER,
  "contenido" TEXT NOT NULL,
  "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leido_en" TIMESTAMP(3),
  CONSTRAINT "mensaje_revision_proyecto_pkey" PRIMARY KEY ("id_mensaje")
);

DO $$
BEGIN
  ALTER TABLE "mensaje_revision_proyecto"
    ADD CONSTRAINT "mensaje_revision_proyecto_id_proyecto_fkey"
    FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "mensaje_revision_proyecto"
    ADD CONSTRAINT "mensaje_revision_proyecto_id_remitente_fkey"
    FOREIGN KEY ("id_remitente") REFERENCES "usuario"("id_usuario")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "mensaje_revision_proyecto"
    ADD CONSTRAINT "mensaje_revision_proyecto_id_revision_fkey"
    FOREIGN KEY ("id_revision") REFERENCES "revision_proyecto"("id_revision_proyecto")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
