-- CreateTable
CREATE TABLE "preferencia_no_molestar" (
    "id_preferencia" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "hora_inicio" VARCHAR(5) NOT NULL DEFAULT '22:00',
    "hora_fin" VARCHAR(5) NOT NULL DEFAULT '07:00',
    "dias_semana" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "zona" VARCHAR(64) NOT NULL DEFAULT 'America/Guatemala',
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferencia_no_molestar_pkey" PRIMARY KEY ("id_preferencia")
);

-- CreateIndex
CREATE UNIQUE INDEX "preferencia_no_molestar_id_usuario_key" ON "preferencia_no_molestar"("id_usuario");

-- AddForeignKey
ALTER TABLE "preferencia_no_molestar" ADD CONSTRAINT "preferencia_no_molestar_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
