-- HU-186 (T-329): registro de avisos de vencimiento enviados. Migración
-- ADITIVA: una tabla nueva vacía; no toca columnas ni filas existentes.

-- CreateTable
CREATE TABLE "recordatorio_tarea" (
    "id_recordatorio" SERIAL NOT NULL,
    "id_tarea" INTEGER NOT NULL,
    "ventana_horas" INTEGER NOT NULL,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorio_tarea_pkey" PRIMARY KEY ("id_recordatorio"),
    CONSTRAINT "recordatorio_tarea_ventana_horas_check" CHECK ("ventana_horas" IN (24, 48))
);

-- CreateIndex
CREATE UNIQUE INDEX "recordatorio_tarea_id_tarea_ventana_horas_key" ON "recordatorio_tarea"("id_tarea", "ventana_horas");

-- AddForeignKey
ALTER TABLE "recordatorio_tarea" ADD CONSTRAINT "recordatorio_tarea_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE CASCADE ON UPDATE CASCADE;
