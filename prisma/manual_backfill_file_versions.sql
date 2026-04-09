ALTER TABLE "File"
ADD COLUMN IF NOT EXISTS "version" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "uploadedById", "name"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "nextVersion"
  FROM "File"
)
UPDATE "File" f
SET "version" = ranked."nextVersion"
FROM ranked
WHERE f."id" = ranked."id";

UPDATE "File"
SET "version" = 1
WHERE "version" IS NULL;

ALTER TABLE "File"
ALTER COLUMN "version" SET DEFAULT 1;

ALTER TABLE "File"
ALTER COLUMN "version" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'File_uploadedById_name_version_key'
  ) THEN
    CREATE UNIQUE INDEX "File_uploadedById_name_version_key"
      ON "File" ("uploadedById", "name", "version");
  END IF;
END $$;
