-- DropIndex
DROP INDEX "asignacion_tarea_id_tarea_id_usuario_key";

-- AlterTable
ALTER TABLE "asignacion_tarea" ADD COLUMN     "desasignada_en" TIMESTAMP(3);

-- Backfill: close every historical asignacion_tarea row except the most
-- recent one per id_tarea, determined by fecha_asignacion (tie-broken by
-- id_asignacion). No rows are deleted; desasignada_en is set to the start
-- of the next assignment for that task so history stays consistent.
WITH asignaciones_ordenadas AS (
    SELECT
        id_asignacion,
        LEAD(fecha_asignacion) OVER (
            PARTITION BY id_tarea
            ORDER BY fecha_asignacion ASC, id_asignacion ASC
        ) AS siguiente_asignacion_en
    FROM "asignacion_tarea"
    WHERE desasignada_en IS NULL
)
UPDATE "asignacion_tarea" AS asignacion
SET desasignada_en = asignaciones_ordenadas.siguiente_asignacion_en
FROM asignaciones_ordenadas
WHERE asignacion.id_asignacion = asignaciones_ordenadas.id_asignacion
  AND asignaciones_ordenadas.siguiente_asignacion_en IS NOT NULL;

-- AlterTable
ALTER TABLE "tarea" ADD COLUMN     "eliminado_en" TIMESTAMP(3),
ADD COLUMN     "id_rol_proyecto" INTEGER,
ADD COLUMN     "tiempo_estimado_horas" INTEGER;

-- CreateTable
CREATE TABLE "etiqueta" (
    "id_etiqueta" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "nombre_etiqueta" VARCHAR(255) NOT NULL,
    "nombre_normalizado" VARCHAR(255) NOT NULL,
    "color" VARCHAR(7) NOT NULL,

    CONSTRAINT "etiqueta_pkey" PRIMARY KEY ("id_etiqueta")
);

-- CreateTable
CREATE TABLE "tarea_etiqueta" (
    "id_tarea" INTEGER NOT NULL,
    "id_etiqueta" INTEGER NOT NULL,

    CONSTRAINT "tarea_etiqueta_pkey" PRIMARY KEY ("id_tarea","id_etiqueta")
);

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_id_proyecto_nombre_normalizado_key" ON "etiqueta"("id_proyecto", "nombre_normalizado");

-- CreateIndex
CREATE INDEX "tarea_etiqueta_id_etiqueta_idx" ON "tarea_etiqueta"("id_etiqueta");

-- CreateIndex
CREATE INDEX "asignacion_tarea_id_usuario_desasignada_en_idx" ON "asignacion_tarea"("id_usuario", "desasignada_en");

-- CreateIndex
CREATE INDEX "tarea_id_proyecto_eliminado_en_estado_tarea_idx" ON "tarea"("id_proyecto", "eliminado_en", "estado_tarea");

-- CreateIndex
CREATE INDEX "tarea_id_proyecto_id_rol_proyecto_idx" ON "tarea"("id_proyecto", "id_rol_proyecto");

-- CreateIndex
CREATE INDEX "tarea_id_hito_idx" ON "tarea"("id_hito");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_etiqueta" ADD CONSTRAINT "tarea_etiqueta_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_etiqueta" ADD CONSTRAINT "tarea_etiqueta_id_etiqueta_fkey" FOREIGN KEY ("id_etiqueta") REFERENCES "etiqueta"("id_etiqueta") ON DELETE CASCADE ON UPDATE CASCADE;
