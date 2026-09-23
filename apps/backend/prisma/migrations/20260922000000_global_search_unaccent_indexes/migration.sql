-- T-270 (HU-171): búsqueda global tolerante a acentos para proyectos y
-- tareas. Reutiliza `immutable_unaccent`, ya creada por la migración
-- `20260919013017_user_name_search_unaccent` (T-245) — no se define una
-- segunda función de normalización.
CREATE INDEX proyecto_titulo_unaccent_trgm_idx
  ON proyecto USING GIN (immutable_unaccent(lower(titulo_proyecto)) gin_trgm_ops);

CREATE INDEX tarea_titulo_unaccent_trgm_idx
  ON tarea USING GIN (immutable_unaccent(lower(titulo_tarea)) gin_trgm_ops);
