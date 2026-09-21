-- HU-160: fecha de fin planeada del Sprint (fija la línea ideal del burndown,
-- no la fecha real de cierre) + columnas congeladas al cerrar (T-239) +
-- instantánea diaria (T-238).

ALTER TABLE "sprint" ADD COLUMN "fecha_fin_planeada" DATE;

-- Congelado al cerrar (T-239): null hasta CERRADO, escrito una única vez
-- dentro de la misma transacción de `closeSprint`.
ALTER TABLE "sprint" ADD COLUMN "tareas_planificadas_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "tareas_completadas_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "hitos_totales_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "hitos_completados_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "porcentaje_cumplimiento_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "puntos_historia_planificados_cierre" INTEGER;
ALTER TABLE "sprint" ADD COLUMN "puntos_historia_completados_cierre" INTEGER;

-- Instantánea diaria (T-238): fuente del burndown, inmutable para fechas
-- pasadas por construcción (ver unique([idSprint, fecha]) más abajo).
CREATE TABLE "instantanea_sprint" (
    "id_instantanea" SERIAL NOT NULL,
    "id_sprint" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "tareas_pendientes" INTEGER NOT NULL,
    "tareas_completadas" INTEGER NOT NULL,
    "puntos_historia_restantes" INTEGER NOT NULL,
    "generada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instantanea_sprint_pkey" PRIMARY KEY ("id_instantanea")
);

CREATE UNIQUE INDEX "instantanea_sprint_id_sprint_fecha_key" ON "instantanea_sprint"("id_sprint", "fecha");

ALTER TABLE "instantanea_sprint" ADD CONSTRAINT "instantanea_sprint_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE RESTRICT ON UPDATE CASCADE;
