-- MEJ-96: estado RETIRADA de la postulacion. Migracion aislada y ADITIVA (un valor de enum nuevo no se puede usar en la misma transaccion).
ALTER TYPE "EstadoPostulacion" ADD VALUE IF NOT EXISTS 'RETIRADA';
