-- T-245: búsqueda de personas por nombre tolerante a acentos y a
-- coincidencias parciales (reutilizable por T-243/bitácora y, más
-- adelante, por HU-159/HU-171 — ver UserNameSearchService).
--
-- `unaccent()`, la función que ofrece la extensión `unaccent`, está marcada
-- STABLE (no IMMUTABLE) en Postgres porque en general depende de un
-- diccionario de texto configurable en tiempo de ejecución. Postgres NO
-- permite indexar una expresión que llame a una función no-IMMUTABLE
-- ("functions in index expression must be marked IMMUTABLE"), así que no
-- se puede crear un índice sobre `unaccent(lower(nombre))` directamente
-- (verificado: falla con ese error exacto).
--
-- La solución estándar de Postgres es envolver `unaccent()` fijando el
-- diccionario 'unaccent' explícitamente en una función SQL propia marcada
-- IMMUTABLE. `SET search_path` en la función evita que la resolución del
-- diccionario dependa del `search_path` de quien la invoque (sin esto, la
-- resolución del diccionario dentro de CREATE INDEX falla con "text search
-- dictionary "unaccent" does not exist" — también verificado).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = public, pg_catalog;

-- Índices GIN de trigramas (pg_trgm) sobre la expresión normalizada —
-- necesarios para que `LIKE '%...%'` (coincidencia parcial, no solo
-- prefijo) use el índice en vez de un Seq Scan de toda la tabla `usuario`.
-- Medido con 30,000 usuarios (UserNameSearchService.findMatchingUserIds,
-- búsqueda de 3 caracteres): ~100ms (Seq Scan) -> ~0.3ms (Bitmap Index
-- Scan + BitmapOr) tras `ANALYZE usuario` — el planner necesita estadísticas
-- actualizadas para elegir el índice por sí solo; con estadísticas
-- desactualizadas prefiere Seq Scan aunque el índice exista.
CREATE INDEX usuario_nombre_unaccent_trgm_idx
  ON usuario USING GIN (immutable_unaccent(lower(nombre)) gin_trgm_ops);
CREATE INDEX usuario_apellido_unaccent_trgm_idx
  ON usuario USING GIN (immutable_unaccent(lower(apellido)) gin_trgm_ops);
