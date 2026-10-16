-- CreateTable
CREATE TABLE "apodo_conversacion" (
    "id_apodo" SERIAL NOT NULL,
    "id_conversacion" INTEGER NOT NULL,
    "id_usuario_define" INTEGER NOT NULL,
    "id_usuario_objetivo" INTEGER NOT NULL,
    "apodo" VARCHAR(40) NOT NULL,

    CONSTRAINT "apodo_conversacion_pkey" PRIMARY KEY ("id_apodo")
);

-- CreateIndex
CREATE INDEX "apodo_conversacion_id_usuario_define_idx" ON "apodo_conversacion"("id_usuario_define");

-- CreateIndex
CREATE UNIQUE INDEX "apodo_conversacion_id_conversacion_id_usuario_define_id_usu_key" ON "apodo_conversacion"("id_conversacion", "id_usuario_define", "id_usuario_objetivo");

-- AddForeignKey
ALTER TABLE "apodo_conversacion" ADD CONSTRAINT "apodo_conversacion_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion"("id_conversacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apodo_conversacion" ADD CONSTRAINT "apodo_conversacion_id_usuario_define_fkey" FOREIGN KEY ("id_usuario_define") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apodo_conversacion" ADD CONSTRAINT "apodo_conversacion_id_usuario_objetivo_fkey" FOREIGN KEY ("id_usuario_objetivo") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
