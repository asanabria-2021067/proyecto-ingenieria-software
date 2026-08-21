-- FND-05: segundo paso (de dos) de la migración del enum EstadoSolicitudSalida.
-- FND-04 ya añadió PREPARACION sin tocar nada más. Este paso:
--   1) renombra el valor PostgreSQL PENDIENTE -> PENDIENTE_LIDER (RENAME
--      VALUE, no ADD VALUE + UPDATE: preserva la identidad de cada fila —
--      mismo id_solicitud, mismos timestamps, mismo proyecto/usuario/motivo
--      — porque PostgreSQL solo reetiqueta el valor del enum, nunca reescribe
--      las filas que lo usan);
--   2) recrea el índice único parcial de solicitudes abiertas
--      (solicitud_salida_proyecto_pendiente_unique) para cubrir los dos
--      estados abiertos actuales: PREPARACION y PENDIENTE_LIDER. APROBADA,
--      RECHAZADA y CANCELADA siguen sin restricción (historial completo).
--
-- No implementa todavía la transición funcional a PREPARACION (B5): el
-- default de la columna sigue siendo el mismo valor semántico de antes,
-- solo que ahora se llama PENDIENTE_LIDER.

-- RenameEnumValue
ALTER TYPE "EstadoSolicitudSalida" RENAME VALUE 'PENDIENTE' TO 'PENDIENTE_LIDER';

-- DropIndex
DROP INDEX "solicitud_salida_proyecto_pendiente_unique";

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_salida_proyecto_pendiente_unique"
ON "solicitud_salida_proyecto" ("id_proyecto", "id_usuario")
WHERE "estado_solicitud" IN ('PREPARACION', 'PENDIENTE_LIDER');
