-- Busqueda de mensajes de chat por texto parcial e insensible a acentos.
-- pg_trgm e immutable_unaccent ya existen (migracion user_name_search_unaccent);
-- el IF NOT EXISTS mantiene la migracion autonoma. El indice por
-- (id_conversacion, enviado_en) ya existe desde add_chat_conversaciones.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX mensaje_chat_contenido_unaccent_trgm_idx
	ON mensaje_chat USING GIN (immutable_unaccent(lower(contenido)) gin_trgm_ops);
