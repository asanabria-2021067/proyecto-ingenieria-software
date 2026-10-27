-- IESUC-568 (RTF 2 · 3.2): a lo sumo UNA fila de amistad por par de usuarios,
-- sin importar quién la envió. El @@unique de Prisma es direccional
-- (solicitante, receptor) y no impide que A→B y B→A se creen a la vez; este
-- índice de expresión sí. Prisma no puede declararlo en schema.prisma, por eso
-- vive solo aquí (mismo criterio que sprint_operable_unique).
--
-- No borra ni modifica filas. Si ya existieran pares cruzados duplicados, la
-- migración se detiene con un mensaje claro para resolverlos a mano antes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "amistad"
    GROUP BY LEAST("id_usuario_solicitante", "id_usuario_receptor"),
             GREATEST("id_usuario_solicitante", "id_usuario_receptor")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'amistad tiene pares de usuarios duplicados en sentido inverso; resuélvelos antes de aplicar 20261027120000_amistad_par_no_ordenado_unico';
  END IF;
END $$;

CREATE UNIQUE INDEX "amistad_par_no_ordenado_key"
  ON "amistad" (LEAST("id_usuario_solicitante", "id_usuario_receptor"),
                GREATEST("id_usuario_solicitante", "id_usuario_receptor"));
