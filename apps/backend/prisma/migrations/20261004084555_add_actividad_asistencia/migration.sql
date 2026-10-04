-- CreateEnum
CREATE TYPE "TipoActividad" AS ENUM ('REUNION', 'JORNADA', 'TALLER', 'OTRO');

-- CreateTable
CREATE TABLE "actividad_proyecto" (
    "id_actividad" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "titulo_actividad" VARCHAR(200) NOT NULL,
    "tipo_actividad" "TipoActividad" NOT NULL,
    "fecha_actividad" DATE NOT NULL,
    "horas_valor" DECIMAL(6,2) NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actividad_proyecto_pkey" PRIMARY KEY ("id_actividad")
);

-- CreateTable
CREATE TABLE "asistencia_actividad" (
    "id_asistencia" SERIAL NOT NULL,
    "id_actividad" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "asistio" BOOLEAN NOT NULL DEFAULT false,
    "confirmado_por" INTEGER,
    "confirmado_en" TIMESTAMP(3),
    "id_registro_horas" INTEGER,

    CONSTRAINT "asistencia_actividad_pkey" PRIMARY KEY ("id_asistencia")
);

-- CreateIndex
CREATE INDEX "actividad_proyecto_id_proyecto_fecha_actividad_idx" ON "actividad_proyecto"("id_proyecto", "fecha_actividad");

-- CreateIndex
CREATE UNIQUE INDEX "asistencia_actividad_id_registro_horas_key" ON "asistencia_actividad"("id_registro_horas");

-- CreateIndex
CREATE UNIQUE INDEX "asistencia_actividad_id_actividad_id_usuario_key" ON "asistencia_actividad"("id_actividad", "id_usuario");

-- AddForeignKey
ALTER TABLE "actividad_proyecto" ADD CONSTRAINT "actividad_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_proyecto" ADD CONSTRAINT "actividad_proyecto_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_actividad" ADD CONSTRAINT "asistencia_actividad_id_actividad_fkey" FOREIGN KEY ("id_actividad") REFERENCES "actividad_proyecto"("id_actividad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_actividad" ADD CONSTRAINT "asistencia_actividad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_actividad" ADD CONSTRAINT "asistencia_actividad_confirmado_por_fkey" FOREIGN KEY ("confirmado_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_actividad" ADD CONSTRAINT "asistencia_actividad_id_registro_horas_fkey" FOREIGN KEY ("id_registro_horas") REFERENCES "horas_participacion"("id_registro_horas") ON DELETE SET NULL ON UPDATE CASCADE;
