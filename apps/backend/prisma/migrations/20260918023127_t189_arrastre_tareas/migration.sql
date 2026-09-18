-- CreateEnum
CREATE TYPE "DestinoArrastre" AS ENUM ('SIGUIENTE_SPRINT', 'BACKLOG');

-- DropForeignKey
ALTER TABLE "tarea" DROP CONSTRAINT "tarea_id_sprint_fkey";

-- AlterTable
ALTER TABLE "sprint" ADD COLUMN     "tareas_arrastradas_cierre" INTEGER;

-- AlterTable
ALTER TABLE "tarea" ADD COLUMN     "destino_arrastre" "DestinoArrastre",
ALTER COLUMN "id_sprint" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_sprint_fkey" FOREIGN KEY ("id_sprint") REFERENCES "sprint"("id_sprint") ON DELETE SET NULL ON UPDATE CASCADE;
