-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN "es_canal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "nombre_canal" VARCHAR(40);

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_id_proyecto_nombre_canal_key" ON "conversacion"("id_proyecto", "nombre_canal");

-- Backfill: canal general para los proyectos existentes no cerrados (idempotente)
INSERT INTO "conversacion" ("id_proyecto", "tipo", "nombre", "creada_por", "es_canal", "nombre_canal")
SELECT p."id_proyecto", 'GRUPAL', 'general', p."creado_por", true, 'general'
FROM "proyecto" p
WHERE p."eliminado_en" IS NULL
	AND p."estado_proyecto" <> 'CERRADO'
	AND NOT EXISTS (
		SELECT 1 FROM "conversacion" c
		WHERE c."id_proyecto" = p."id_proyecto" AND c."nombre_canal" = 'general'
	);

-- Backfill: el lider y los participantes ACTIVO entran al canal general
INSERT INTO "conversacion_participante" ("id_conversacion", "id_usuario")
SELECT c."id_conversacion", p."creado_por"
FROM "conversacion" c
JOIN "proyecto" p ON p."id_proyecto" = c."id_proyecto"
WHERE c."es_canal" AND c."nombre_canal" = 'general'
UNION
SELECT c."id_conversacion", pp."id_usuario"
FROM "conversacion" c
JOIN "rol_proyecto" rp ON rp."id_proyecto" = c."id_proyecto"
JOIN "participacion_proyecto" pp ON pp."id_rol_proyecto" = rp."id_rol_proyecto"
WHERE c."es_canal" AND c."nombre_canal" = 'general' AND pp."estado_participacion" = 'ACTIVO'
ON CONFLICT DO NOTHING;
