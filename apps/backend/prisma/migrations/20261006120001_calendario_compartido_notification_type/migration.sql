-- HU-184: aviso al usuario cuando alguien le comparte su calendario.
-- Aditiva: solo agrega el valor al final del enum, sin reordenar los existentes.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'CALENDARIO_COMPARTIDO';
