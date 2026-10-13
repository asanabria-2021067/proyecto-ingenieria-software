-- CreateTable
CREATE TABLE "preferencia_notificacion" (
    "id_preferencia" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo_notificacion" "TipoNotificacion" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferencia_notificacion_pkey" PRIMARY KEY ("id_preferencia")
);

-- CreateIndex
CREATE UNIQUE INDEX "preferencia_notificacion_id_usuario_tipo_notificacion_key" ON "preferencia_notificacion"("id_usuario", "tipo_notificacion");

-- AddForeignKey
ALTER TABLE "preferencia_notificacion" ADD CONSTRAINT "preferencia_notificacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

