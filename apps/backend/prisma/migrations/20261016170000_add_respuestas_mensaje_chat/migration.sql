-- AlterTable
ALTER TABLE "mensaje_chat" ADD COLUMN     "id_mensaje_citado" INTEGER;

-- AddForeignKey
ALTER TABLE "mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_mensaje_citado_fkey" FOREIGN KEY ("id_mensaje_citado") REFERENCES "mensaje_chat"("id_mensaje") ON DELETE SET NULL ON UPDATE CASCADE;
