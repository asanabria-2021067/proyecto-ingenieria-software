-- FND-04: primer paso (de dos) de la migración del enum EstadoSolicitudSalida.
-- Únicamente añade el valor PREPARACION al dominio permitido por PostgreSQL.
-- No renombra PENDIENTE -> PENDIENTE_LIDER (eso es FND-05), no toca datos
-- existentes, no cambia el default de SolicitudSalidaProyecto.estadoSolicitud
-- (sigue siendo PENDIENTE) y no modifica el índice único parcial
-- solicitud_salida_proyecto_pendiente_unique.
ALTER TYPE "EstadoSolicitudSalida" ADD VALUE 'PREPARACION';
