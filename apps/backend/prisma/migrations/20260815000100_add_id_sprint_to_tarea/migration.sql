-- AlterTable
-- id_sprint es NULLABLE: las tareas existentes permanecen sin sprint asignado
-- (id_sprint = NULL) hasta que FND-02/FND-03 definan el backfill y el
-- NOT NULL respectivamente. No se toca aquí.
ALTER TABLE "tarea" ADD COLUMN "id_sprint" INTEGER;

-- CreateIndex
CREATE INDEX "tarea_id_sprint_idx" ON "tarea"("id_sprint");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE SET NULL ON UPDATE CASCADE;
