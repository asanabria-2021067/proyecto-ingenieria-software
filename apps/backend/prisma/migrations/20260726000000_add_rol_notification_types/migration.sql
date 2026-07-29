-- Extend TipoNotificacion with the role-participation events introduced by the
-- roles/participation ampliación (Sección 18): ROL_ABANDONADO (limited role
-- withdrawal), ROL_ASIGNADO_LIDER (leader self-assign) and ROL_ACTUALIZADO
-- (relevant role edits). IF NOT EXISTS keeps the migration idempotent, matching
-- the precedent in 20260514080000_extend_tipo_notificacion.
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ROL_ABANDONADO';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ROL_ASIGNADO_LIDER';
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ROL_ACTUALIZADO';
