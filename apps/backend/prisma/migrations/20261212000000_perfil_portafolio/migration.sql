-- MEJ-102, 146 a 149, 153 y 154: portafolio publico, confirmaciones, disponibilidad, enlaces, bloqueos/silencios, reportes de perfil y mensaje de bienvenida.
-- CreateTable
CREATE TABLE "portafolio_publico" (
	"id_usuario" INTEGER NOT NULL,
	"token" VARCHAR(64) NOT NULL,
	"activo" BOOLEAN NOT NULL DEFAULT false,
	"indexable" BOOLEAN NOT NULL DEFAULT false,
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"actualizado_en" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "portafolio_publico_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "confirmacion_habilidad" (
	"id_confirmacion" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"id_habilidad" INTEGER NOT NULL,
	"id_confirmador" INTEGER NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "confirmacion_habilidad_pkey" PRIMARY KEY ("id_confirmacion")
);

-- CreateTable
CREATE TABLE "disponibilidad_semanal" (
	"id_disponibilidad" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"dia_semana" SMALLINT NOT NULL,
	"hora" SMALLINT NOT NULL,

	CONSTRAINT "disponibilidad_semanal_pkey" PRIMARY KEY ("id_disponibilidad")
);

-- CreateTable
CREATE TABLE "enlace_perfil" (
	"id_enlace" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"url" VARCHAR(2048) NOT NULL,
	"orden" INTEGER NOT NULL DEFAULT 0,
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "enlace_perfil_pkey" PRIMARY KEY ("id_enlace")
);

-- CreateIndex
CREATE UNIQUE INDEX "portafolio_publico_token_key" ON "portafolio_publico"("token");

-- CreateIndex
CREATE INDEX "confirmacion_habilidad_id_confirmador_idx" ON "confirmacion_habilidad"("id_confirmador");

-- CreateIndex
CREATE UNIQUE INDEX "confirmacion_habilidad_id_usuario_id_habilidad_id_confirmad_key" ON "confirmacion_habilidad"("id_usuario", "id_habilidad", "id_confirmador");

-- CreateIndex
CREATE UNIQUE INDEX "disponibilidad_semanal_id_usuario_dia_semana_hora_key" ON "disponibilidad_semanal"("id_usuario", "dia_semana", "hora");

-- CreateIndex
CREATE UNIQUE INDEX "enlace_perfil_id_usuario_url_key" ON "enlace_perfil"("id_usuario", "url");

-- AddForeignKey
ALTER TABLE "portafolio_publico" ADD CONSTRAINT "portafolio_publico_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacion_habilidad" ADD CONSTRAINT "confirmacion_habilidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacion_habilidad" ADD CONSTRAINT "confirmacion_habilidad_id_habilidad_fkey" FOREIGN KEY ("id_habilidad") REFERENCES "habilidad"("id_habilidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacion_habilidad" ADD CONSTRAINT "confirmacion_habilidad_id_confirmador_fkey" FOREIGN KEY ("id_confirmador") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidad_semanal" ADD CONSTRAINT "disponibilidad_semanal_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlace_perfil" ADD CONSTRAINT "enlace_perfil_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CheckConstraint
ALTER TABLE "disponibilidad_semanal" ADD CONSTRAINT "disponibilidad_semanal_dia_hora_check" CHECK ("dia_semana" BETWEEN 0 AND 6 AND "hora" BETWEEN 0 AND 23);

-- AlterTable
ALTER TABLE "proyecto" ADD COLUMN "mensaje_bienvenida" VARCHAR(1000);

-- CreateEnum
CREATE TYPE "TipoRestriccion" AS ENUM ('BLOQUEO', 'SILENCIO');

-- CreateEnum
CREATE TYPE "MotivoReportePerfil" AS ENUM ('SPAM', 'ACOSO', 'CONTENIDO_INAPROPIADO', 'SUPLANTACION', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoReportePerfil" AS ENUM ('PENDIENTE', 'DESCARTADO', 'ATENDIDO');

-- CreateTable
CREATE TABLE "restriccion_usuario" (
	"id_restriccion" SERIAL NOT NULL,
	"id_usuario" INTEGER NOT NULL,
	"id_objetivo" INTEGER NOT NULL,
	"tipo" "TipoRestriccion" NOT NULL,
	"creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "restriccion_usuario_pkey" PRIMARY KEY ("id_restriccion")
);

-- CreateTable
CREATE TABLE "reporte_perfil" (
	"id_reporte" SERIAL NOT NULL,
	"id_reportante" INTEGER NOT NULL,
	"id_reportado" INTEGER NOT NULL,
	"id_mensaje" INTEGER,
	"texto_mensaje" VARCHAR(500),
	"motivo" "MotivoReportePerfil" NOT NULL,
	"detalle" VARCHAR(500),
	"estado" "EstadoReportePerfil" NOT NULL DEFAULT 'PENDIENTE',
	"nota" VARCHAR(500),
	"creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"resuelto_en" TIMESTAMP(3),
	"resuelto_por" INTEGER,

	CONSTRAINT "reporte_perfil_pkey" PRIMARY KEY ("id_reporte")
);

-- CreateIndex
CREATE UNIQUE INDEX "restriccion_usuario_id_usuario_id_objetivo_tipo_key" ON "restriccion_usuario"("id_usuario", "id_objetivo", "tipo");

-- CreateIndex
CREATE INDEX "restriccion_usuario_id_objetivo_tipo_idx" ON "restriccion_usuario"("id_objetivo", "tipo");

-- CreateIndex
CREATE INDEX "reporte_perfil_estado_creado_en_idx" ON "reporte_perfil"("estado", "creado_en");

-- AddForeignKey
ALTER TABLE "restriccion_usuario" ADD CONSTRAINT "restriccion_usuario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restriccion_usuario" ADD CONSTRAINT "restriccion_usuario_id_objetivo_fkey" FOREIGN KEY ("id_objetivo") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_perfil" ADD CONSTRAINT "reporte_perfil_id_reportante_fkey" FOREIGN KEY ("id_reportante") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_perfil" ADD CONSTRAINT "reporte_perfil_id_reportado_fkey" FOREIGN KEY ("id_reportado") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_perfil" ADD CONSTRAINT "reporte_perfil_resuelto_por_fkey" FOREIGN KEY ("resuelto_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
