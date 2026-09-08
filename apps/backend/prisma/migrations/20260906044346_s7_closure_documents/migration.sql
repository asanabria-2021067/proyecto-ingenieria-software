-- S7 M5 `s7_closure_documents` (06 v2 §37; §35 modelos RevisionCierreProyecto,
-- DocumentoCierre y DocumentoRevisionCierre; §36 CK17…CK30 y CK32 más
-- s7_revision_borrador, s7_revision_enviada y s7_informe_en_generacion;
-- §24–§28 lifecycle documental; §25 MAX_DOCUMENT_SIZE = 10485760;
-- §53.1 FINAL-CLOUD-01).
--
-- Crea los tres enums, la revisión de cierre (numeración única por proyecto,
-- a lo sumo una BORRADOR y una ENVIADA), el documento de cierre que también
-- es la reserva técnica de carga (identidad remota, metadata criptográfica,
-- huellas y ciclo RESERVADO → EN_CARGA → DISPONIBLE → PURGA_PENDIENTE →
-- PURGADO) y el puente de entrega (orden 0 automático, 1…10 evidencias). La
-- FK del informe oficial se añade después de que existan ambas tablas y
-- queda UNIQUE: el oficial nunca pasa por el puente. Todas las FK son
-- RESTRICT al borrar y CASCADE al actualizar. El techo inclusivo de
-- 10485760 bytes por archivo nace en CK29 desde esta creación; no existe
-- migración correctiva posterior. Tablas nuevas y vacías: CHECK validados;
-- ningún proyecto legacy en EN_SOLICITUD_CIERRE recibe una revisión
-- ficticia. Depende de M4.

-- CreateEnum
CREATE TYPE "EstadoRevisionCierre" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'CORRECCION_DOCUMENTAL', 'DEVUELTA_A_EJECUCION');

-- CreateEnum
CREATE TYPE "TipoDocumentoCierre" AS ENUM ('INFORME_AUTOMATICO', 'EVIDENCIA_LIDER', 'INFORME_OFICIAL_FINAL');

-- CreateEnum
CREATE TYPE "EstadoDocumentoCierre" AS ENUM ('RESERVADO', 'EN_CARGA', 'DISPONIBLE', 'PURGA_PENDIENTE', 'PURGADO');

-- CreateTable
CREATE TABLE "revision_cierre_proyecto" (
    "id_revision_cierre" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "numero_revision" INTEGER NOT NULL,
    "estado_revision" "EstadoRevisionCierre" NOT NULL DEFAULT 'BORRADOR',
    "id_solicitante" INTEGER,
    "enviada_en" TIMESTAMP(3),
    "fingerprint_entrega" CHAR(64),
    "id_revisor" INTEGER,
    "comentario_revisor" TEXT,
    "resuelta_en" TIMESTAMP(3),
    "id_documento_oficial" INTEGER,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_cierre_proyecto_pkey" PRIMARY KEY ("id_revision_cierre")
);

-- CreateTable
CREATE TABLE "documento_cierre" (
    "id_documento_cierre" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_revision_origen" INTEGER NOT NULL,
    "tipo_documento" "TipoDocumentoCierre" NOT NULL,
    "proveedor" VARCHAR(32) NOT NULL DEFAULT 'cloudinary',
    "external_id" VARCHAR(255) NOT NULL,
    "resource_type" VARCHAR(16) NOT NULL DEFAULT 'raw',
    "delivery_type" VARCHAR(16) NOT NULL,
    "asset_id" VARCHAR(255),
    "version_remota" VARCHAR(64),
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL DEFAULT 'application/pdf',
    "tamano_bytes" BIGINT,
    "tamano_cifrado_bytes" BIGINT,
    "checksum_sha256" CHAR(64),
    "checksum_cifrado_sha256" CHAR(64),
    "crypto_metadata" JSONB,
    "generator_version" VARCHAR(64),
    "fingerprint_ejecucion" CHAR(64),
    "fingerprint_modelo" CHAR(64),
    "contexto_reporte" JSONB,
    "id_autor" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_documento" "EstadoDocumentoCierre" NOT NULL DEFAULT 'RESERVADO',
    "reserva_expira_en" TIMESTAMP(3) NOT NULL,
    "carga_iniciada_en" TIMESTAMP(3),
    "carga_limite_en" TIMESTAMP(3),
    "disponible_en" TIMESTAMP(3),
    "purga_solicitada_en" TIMESTAMP(3),
    "purgado_en" TIMESTAMP(3),

    CONSTRAINT "documento_cierre_pkey" PRIMARY KEY ("id_documento_cierre")
);

-- CreateTable
CREATE TABLE "documento_revision_cierre" (
    "id_documento_revision" SERIAL NOT NULL,
    "id_revision_cierre" INTEGER NOT NULL,
    "id_documento_cierre" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "vinculado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_revision_cierre_pkey" PRIMARY KEY ("id_documento_revision")
);

-- CreateIndex
CREATE UNIQUE INDEX "revision_cierre_proyecto_id_documento_oficial_key" ON "revision_cierre_proyecto"("id_documento_oficial");

-- CreateIndex
CREATE INDEX "revision_cierre_proyecto_id_proyecto_estado_revision_idx" ON "revision_cierre_proyecto"("id_proyecto", "estado_revision");

-- CreateIndex
CREATE INDEX "revision_cierre_proyecto_estado_revision_enviada_en_idx" ON "revision_cierre_proyecto"("estado_revision", "enviada_en");

-- CreateIndex
CREATE UNIQUE INDEX "revision_cierre_proyecto_id_proyecto_numero_revision_key" ON "revision_cierre_proyecto"("id_proyecto", "numero_revision");

-- CreateIndex
CREATE INDEX "documento_cierre_id_proyecto_tipo_documento_idx" ON "documento_cierre"("id_proyecto", "tipo_documento");

-- CreateIndex
CREATE INDEX "documento_cierre_estado_documento_creado_en_idx" ON "documento_cierre"("estado_documento", "creado_en");

-- CreateIndex
CREATE INDEX "documento_cierre_id_revision_origen_tipo_documento_idx" ON "documento_cierre"("id_revision_origen", "tipo_documento");

-- CreateIndex
CREATE UNIQUE INDEX "documento_cierre_proveedor_external_id_key" ON "documento_cierre"("proveedor", "external_id");

-- CreateIndex
CREATE INDEX "documento_revision_cierre_id_documento_cierre_idx" ON "documento_revision_cierre"("id_documento_cierre");

-- CreateIndex
CREATE UNIQUE INDEX "documento_revision_cierre_id_revision_cierre_id_documento_c_key" ON "documento_revision_cierre"("id_revision_cierre", "id_documento_cierre");

-- CreateIndex
CREATE UNIQUE INDEX "documento_revision_cierre_id_revision_cierre_orden_key" ON "documento_revision_cierre"("id_revision_cierre", "orden");

-- AddForeignKey
ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "revision_cierre_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "revision_cierre_proyecto_id_solicitante_fkey" FOREIGN KEY ("id_solicitante") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "revision_cierre_proyecto_id_revisor_fkey" FOREIGN KEY ("id_revisor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "revision_cierre_proyecto_id_documento_oficial_fkey" FOREIGN KEY ("id_documento_oficial") REFERENCES "documento_cierre"("id_documento_cierre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_cierre" ADD CONSTRAINT "documento_cierre_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_cierre" ADD CONSTRAINT "documento_cierre_id_revision_origen_fkey" FOREIGN KEY ("id_revision_origen") REFERENCES "revision_cierre_proyecto"("id_revision_cierre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_cierre" ADD CONSTRAINT "documento_cierre_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_revision_cierre" ADD CONSTRAINT "documento_revision_cierre_id_revision_cierre_fkey" FOREIGN KEY ("id_revision_cierre") REFERENCES "revision_cierre_proyecto"("id_revision_cierre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_revision_cierre" ADD CONSTRAINT "documento_revision_cierre_id_documento_cierre_fkey" FOREIGN KEY ("id_documento_cierre") REFERENCES "documento_cierre"("id_documento_cierre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- S7 §36: CHECK manuales (tablas nuevas, validados desde su creación).
ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "s7_ck_17"
  CHECK ("numero_revision" > 0);

ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "s7_ck_18"
  CHECK (
    ("fingerprint_entrega" IS NULL OR "fingerprint_entrega" ~ '^[0-9a-f]{64}$')
    AND (
      ("estado_revision" = 'BORRADOR'
        AND "id_solicitante" IS NULL AND "enviada_en" IS NULL AND "fingerprint_entrega" IS NULL
        AND "id_revisor" IS NULL AND "resuelta_en" IS NULL AND "comentario_revisor" IS NULL)
      OR ("estado_revision" = 'ENVIADA'
        AND "id_solicitante" IS NOT NULL AND "enviada_en" IS NOT NULL AND "fingerprint_entrega" IS NOT NULL
        AND "id_revisor" IS NULL AND "resuelta_en" IS NULL AND "comentario_revisor" IS NULL)
      OR ("estado_revision" IN ('APROBADA', 'CORRECCION_DOCUMENTAL', 'DEVUELTA_A_EJECUCION')
        AND "id_solicitante" IS NOT NULL AND "enviada_en" IS NOT NULL AND "fingerprint_entrega" IS NOT NULL
        AND "id_revisor" IS NOT NULL AND "resuelta_en" IS NOT NULL)
    )
  );

ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "s7_ck_19"
  CHECK (
    "estado_revision" NOT IN ('CORRECCION_DOCUMENTAL', 'DEVUELTA_A_EJECUCION')
    OR ("comentario_revisor" IS NOT NULL AND btrim("comentario_revisor") <> '')
  );

ALTER TABLE "revision_cierre_proyecto" ADD CONSTRAINT "s7_ck_20"
  CHECK (("estado_revision" = 'APROBADA') = ("id_documento_oficial" IS NOT NULL));

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_21"
  CHECK (
    "proveedor" = 'cloudinary'
    AND "resource_type" = 'raw'
    AND "delivery_type" IN ('authenticated', 'private', 'upload')
  );

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_22"
  CHECK ("mime_type" = 'application/pdf' AND btrim("nombre_archivo") <> '');

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_23"
  CHECK (
    "estado_documento" NOT IN ('EN_CARGA', 'DISPONIBLE')
    OR ("tamano_bytes" IS NOT NULL AND "tamano_cifrado_bytes" IS NOT NULL
      AND "checksum_sha256" IS NOT NULL AND "checksum_cifrado_sha256" IS NOT NULL
      AND "crypto_metadata" IS NOT NULL)
  );

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_24"
  CHECK (
    "estado_documento" <> 'DISPONIBLE'
    OR ("asset_id" IS NOT NULL AND "version_remota" IS NOT NULL AND "disponible_en" IS NOT NULL)
  );

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_25"
  CHECK (
    ("estado_documento" IN ('RESERVADO', 'EN_CARGA', 'DISPONIBLE')
      AND "purga_solicitada_en" IS NULL AND "purgado_en" IS NULL)
    OR ("estado_documento" = 'PURGA_PENDIENTE'
      AND "purga_solicitada_en" IS NOT NULL AND "purgado_en" IS NULL)
    OR ("estado_documento" = 'PURGADO'
      AND "purga_solicitada_en" IS NOT NULL AND "purgado_en" IS NOT NULL
      AND "purgado_en" >= "purga_solicitada_en")
  );

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_26"
  CHECK (
    ("tipo_documento" = 'EVIDENCIA_LIDER'
      AND "generator_version" IS NULL AND "fingerprint_ejecucion" IS NULL
      AND "fingerprint_modelo" IS NULL AND "contexto_reporte" IS NULL)
    OR ("tipo_documento" IN ('INFORME_AUTOMATICO', 'INFORME_OFICIAL_FINAL')
      AND "estado_documento" IN ('EN_CARGA', 'DISPONIBLE')
      AND "generator_version" IS NOT NULL AND "fingerprint_ejecucion" IS NOT NULL
      AND "fingerprint_modelo" IS NOT NULL AND "contexto_reporte" IS NOT NULL)
    OR ("tipo_documento" IN ('INFORME_AUTOMATICO', 'INFORME_OFICIAL_FINAL')
      AND "estado_documento" NOT IN ('EN_CARGA', 'DISPONIBLE'))
  );

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_27"
  CHECK ("reserva_expira_en" > "creado_en");

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_28"
  CHECK (
    ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$')
    AND ("checksum_cifrado_sha256" IS NULL OR "checksum_cifrado_sha256" ~ '^[0-9a-f]{64}$')
    AND ("fingerprint_ejecucion" IS NULL OR "fingerprint_ejecucion" ~ '^[0-9a-f]{64}$')
    AND ("fingerprint_modelo" IS NULL OR "fingerprint_modelo" ~ '^[0-9a-f]{64}$')
  );

-- MAX_DOCUMENT_SIZE = 10 MiB = 10485760 bytes, inclusivo; el ciphertext mide
-- exactamente lo mismo que el PDF porque IV y tag GCM viven en crypto_metadata.
ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_29"
  CHECK (
    ("tamano_bytes" IS NULL OR "tamano_bytes" BETWEEN 1 AND 10485760)
    AND ("tamano_cifrado_bytes" IS NULL OR "tamano_cifrado_bytes" = "tamano_bytes")
  );

ALTER TABLE "documento_revision_cierre" ADD CONSTRAINT "s7_ck_30"
  CHECK ("orden" BETWEEN 0 AND 10);

ALTER TABLE "documento_cierre" ADD CONSTRAINT "s7_ck_32"
  CHECK (
    (("carga_iniciada_en" IS NULL) = ("carga_limite_en" IS NULL))
    AND ("carga_iniciada_en" IS NULL OR "carga_limite_en" > "carga_iniciada_en")
    AND ("estado_documento" NOT IN ('EN_CARGA', 'DISPONIBLE')
      OR ("carga_iniciada_en" IS NOT NULL AND "carga_limite_en" IS NOT NULL))
  );

-- S7 §36: índices únicos parciales documentales.
CREATE UNIQUE INDEX "s7_revision_borrador"
  ON "revision_cierre_proyecto" ("id_proyecto")
  WHERE "estado_revision" = 'BORRADOR';

CREATE UNIQUE INDEX "s7_revision_enviada"
  ON "revision_cierre_proyecto" ("id_proyecto")
  WHERE "estado_revision" = 'ENVIADA';

CREATE UNIQUE INDEX "s7_informe_en_generacion"
  ON "documento_cierre" ("id_revision_origen", "tipo_documento")
  WHERE "tipo_documento" IN ('INFORME_AUTOMATICO', 'INFORME_OFICIAL_FINAL')
    AND "estado_documento" IN ('RESERVADO', 'EN_CARGA');
