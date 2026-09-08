-- S7 M4 `s7_leadership_domain` (06 v2 §37; §35 modelos ApelacionLiderazgo e
-- HistorialLiderazgo; §36 CK10…CK16 y s7_apelacion_pendiente; §18–§20).
--
-- Crea los dos enums, apelacion_liderazgo primero (cuatro FK y tres índices)
-- e historial_liderazgo después (cinco FK, UNIQUE(id_apelacion) como FK real
-- hacia la apelación aceptada y dos índices). El candidato sugerido se lee a
-- través de esa FK y no se duplica en el historial; no existe
-- ApelacionLiderazgo.idHistorial. Todas las FK son RESTRICT al borrar y
-- CASCADE al actualizar. Tablas nuevas y vacías: CHECK validados desde su
-- creación; cero historial fabricado y ninguna fila fundacional. Q1 no
-- requiere schema. Depende de M1 por el protocolo de proyecto.

-- CreateEnum
CREATE TYPE "EstadoApelacionLiderazgo" AS ENUM ('PENDIENTE', 'ACEPTADA', 'DENEGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenCambioLiderazgo" AS ENUM ('SOLICITUD_LIDER', 'CAMBIO_ADMINISTRATIVO');

-- CreateTable
CREATE TABLE "apelacion_liderazgo" (
    "id_apelacion" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_lider_solicitante" INTEGER NOT NULL,
    "asunto" VARCHAR(200) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "id_candidato_propuesto" INTEGER NOT NULL,
    "estado_apelacion" "EstadoApelacionLiderazgo" NOT NULL DEFAULT 'PENDIENTE',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMP(3),
    "id_admin_resolutor" INTEGER,
    "mensaje_resolucion" TEXT,

    CONSTRAINT "apelacion_liderazgo_pkey" PRIMARY KEY ("id_apelacion")
);

-- CreateTable
CREATE TABLE "historial_liderazgo" (
    "id_historial_liderazgo" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_lider_anterior" INTEGER NOT NULL,
    "id_lider_nuevo" INTEGER NOT NULL,
    "id_admin_responsable" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "origen" "OrigenCambioLiderazgo" NOT NULL,
    "id_apelacion" INTEGER,
    "registrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_liderazgo_pkey" PRIMARY KEY ("id_historial_liderazgo")
);

-- CreateIndex
CREATE INDEX "apelacion_liderazgo_id_proyecto_estado_apelacion_idx" ON "apelacion_liderazgo"("id_proyecto", "estado_apelacion");

-- CreateIndex
CREATE INDEX "apelacion_liderazgo_estado_apelacion_creada_en_idx" ON "apelacion_liderazgo"("estado_apelacion", "creada_en");

-- CreateIndex
CREATE INDEX "apelacion_liderazgo_id_lider_solicitante_idx" ON "apelacion_liderazgo"("id_lider_solicitante");

-- CreateIndex
CREATE UNIQUE INDEX "historial_liderazgo_id_apelacion_key" ON "historial_liderazgo"("id_apelacion");

-- CreateIndex
CREATE INDEX "historial_liderazgo_id_proyecto_registrado_en_idx" ON "historial_liderazgo"("id_proyecto", "registrado_en");

-- CreateIndex
CREATE INDEX "historial_liderazgo_id_lider_nuevo_idx" ON "historial_liderazgo"("id_lider_nuevo");

-- AddForeignKey
ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "apelacion_liderazgo_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "apelacion_liderazgo_id_lider_solicitante_fkey" FOREIGN KEY ("id_lider_solicitante") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "apelacion_liderazgo_id_candidato_propuesto_fkey" FOREIGN KEY ("id_candidato_propuesto") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "apelacion_liderazgo_id_admin_resolutor_fkey" FOREIGN KEY ("id_admin_resolutor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "historial_liderazgo_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "historial_liderazgo_id_lider_anterior_fkey" FOREIGN KEY ("id_lider_anterior") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "historial_liderazgo_id_lider_nuevo_fkey" FOREIGN KEY ("id_lider_nuevo") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "historial_liderazgo_id_admin_responsable_fkey" FOREIGN KEY ("id_admin_responsable") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "historial_liderazgo_id_apelacion_fkey" FOREIGN KEY ("id_apelacion") REFERENCES "apelacion_liderazgo"("id_apelacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- S7 §36: CHECK manuales (tablas nuevas, validados desde su creación).
ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "s7_ck_10"
  CHECK (btrim("asunto") <> '' AND btrim("mensaje") <> '');

ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "s7_ck_11"
  CHECK (
    ("estado_apelacion" = 'PENDIENTE'
      AND "resuelta_en" IS NULL
      AND "id_admin_resolutor" IS NULL
      AND "mensaje_resolucion" IS NULL)
    OR ("estado_apelacion" <> 'PENDIENTE'
      AND "resuelta_en" IS NOT NULL
      AND ("estado_apelacion" = 'CANCELADA' OR "id_admin_resolutor" IS NOT NULL))
  );

ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "s7_ck_12"
  CHECK ("estado_apelacion" <> 'DENEGADA' OR ("mensaje_resolucion" IS NOT NULL AND btrim("mensaje_resolucion") <> ''));

ALTER TABLE "apelacion_liderazgo" ADD CONSTRAINT "s7_ck_13"
  CHECK ("id_lider_solicitante" <> "id_candidato_propuesto");

ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "s7_ck_14"
  CHECK (("origen" = 'SOLICITUD_LIDER') = ("id_apelacion" IS NOT NULL));

ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "s7_ck_15"
  CHECK ("id_lider_anterior" <> "id_lider_nuevo");

ALTER TABLE "historial_liderazgo" ADD CONSTRAINT "s7_ck_16"
  CHECK (btrim("motivo") <> '');

-- S7 §36: a lo sumo una apelación PENDIENTE por proyecto y líder solicitante.
CREATE UNIQUE INDEX "s7_apelacion_pendiente"
  ON "apelacion_liderazgo" ("id_proyecto", "id_lider_solicitante")
  WHERE "estado_apelacion" = 'PENDIENTE';
