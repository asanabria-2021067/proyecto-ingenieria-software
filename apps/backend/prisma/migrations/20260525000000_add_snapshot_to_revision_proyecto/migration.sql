-- Add snapshot_proyecto column to revision_proyecto (was defined in schema but missing from migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revision_proyecto'
      AND column_name = 'snapshot_proyecto'
  ) THEN
    ALTER TABLE "revision_proyecto"
      ADD COLUMN "snapshot_proyecto" JSONB;
  END IF;
END
$$;
