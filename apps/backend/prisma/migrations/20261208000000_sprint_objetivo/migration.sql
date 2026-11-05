-- MEJ-117: objetivo opcional del Sprint. Migracion ADITIVA (columna nullable).
ALTER TABLE "sprint"
	ADD COLUMN IF NOT EXISTS "objetivo" VARCHAR(280);
