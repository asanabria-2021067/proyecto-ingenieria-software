-- FND-06 (primera migración, de dos): Foundation de datos exclusivamente
-- para RegistroAvanceAsignacion. No implementa todavía el contrato
-- funcional futuro (B1): sin CHECK de longitud mínima (200 caracteres),
-- sin triggers, sin lógica de edición/autorización — eso es capa de
-- servicio, no schema.
--
-- FKs con ON DELETE RESTRICT (default de Prisma para relaciones
-- obligatorias, igual que el resto del schema): un registro de avance es
-- evidencia histórica y nunca debe desaparecer silenciosamente porque se
-- intente borrar su AsignacionTarea o su autor. No hay operación de delete
-- prevista para esta tabla (ni aquí ni en B1), así que no hace falta SET
-- NULL/CASCADE: si algún día se necesitara borrar una asignación o un
-- usuario con registros de avance asociados, esa decisión debe ser
-- explícita, no un efecto colateral silencioso de la FK.
CREATE TABLE "registro_avance_asignacion" (
    "id_registro_avance" SERIAL NOT NULL,
    "id_asignacion" INTEGER NOT NULL,
    "id_autor" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_en" TIMESTAMP(3),

    CONSTRAINT "registro_avance_asignacion_pkey" PRIMARY KEY ("id_registro_avance")
);

-- AddForeignKey
ALTER TABLE "registro_avance_asignacion" ADD CONSTRAINT "registro_avance_asignacion_id_asignacion_fkey" FOREIGN KEY ("id_asignacion") REFERENCES "asignacion_tarea"("id_asignacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_avance_asignacion" ADD CONSTRAINT "registro_avance_asignacion_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
